import { FastifyInstance } from 'fastify';
import { uploadKnowledgeDocument, listKnowledgeDocuments, deleteKnowledgeDocument } from './knowledge-controller.js';
import { authMiddleware } from '../auth/auth-middleware.js';

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.post('/upload', uploadKnowledgeDocument);
  app.get('/', listKnowledgeDocuments);
  app.delete('/:id', deleteKnowledgeDocument);
}
