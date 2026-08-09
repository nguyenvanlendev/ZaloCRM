import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';

export async function uploadKnowledgeDocument(req: FastifyRequest, reply: FastifyReply) {
  console.log('--- KNOWLEDGE UPLOAD ---');
  console.log('Headers:', req.headers);
  try {
    const data = await req.file();
    if (!data) {
      console.log('req.file() returned undefined. Body:', req.body);
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const fileBuffer = await data.toBuffer();
    
    // 1. Create KnowledgeDocument record in pending state
    const doc = await prisma.knowledgeDocument.create({
      data: {
        orgId: req.user.orgId,
        fileName: data.filename,
        fileSize: fileBuffer.length,
        status: 'processing',
        uploadedBy: req.user.id
      }
    });

    // 2. Forward the file to Python AI Service for GraphRAG Ingestion
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: data.mimetype });
    const formData = new FormData();
    formData.append('file', blob, data.filename);
    formData.append('orgId', req.user.orgId);
    formData.append('docId', doc.id);

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
    
    // Fire and forget asynchronous call
    fetch(`${aiServiceUrl}/api/v1/knowledge/upload`, {
      method: 'POST',
      body: formData
    }).then(async (res: any) => {
      if (!res.ok) {
        console.error('AI Service failed to process document', await res.text());
        await prisma.knowledgeDocument.update({
          where: { id: doc.id },
          data: { status: 'failed', error: 'AI Service returned error' }
        });
      }
    }).catch(async (err: any) => {
      console.error('Failed to call AI Service', err);
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { status: 'failed', error: 'Network error communicating with AI Service' }
      });
    });

    // 3. Return immediately to unblock UI
    return reply.status(200).send({ 
      success: true, 
      document: doc,
      message: 'Document uploaded and is being processed by GraphRAG' 
    });
  } catch (error: any) {
    req.log.error(error);
    return reply.status(500).send({ error: 'Failed to upload document' });
  }
}

export async function listKnowledgeDocuments(req: FastifyRequest, reply: FastifyReply) {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { createdAt: 'desc' }
  });
  return reply.send({ data: docs });
}

export async function deleteKnowledgeDocument(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = req.params;
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id, orgId: req.user.orgId }
  });

  if (!doc) {
    return reply.status(404).send({ error: 'Document not found' });
  }

  // Tell AI service to delete vectors/graphs for this doc
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
  try {
    await fetch(`${aiServiceUrl}/api/v1/knowledge/${id}`, { method: 'DELETE' });
  } catch (err) {
    req.log.error('Failed to delete document vectors from AI service');
  }

  await prisma.knowledgeDocument.delete({ where: { id } });
  return reply.send({ success: true });
}
