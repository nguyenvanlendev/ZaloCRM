import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  getSequences,
  getSequenceDetail,
  createSequence,
  updateSequence,
  addSequenceStep,
  deleteSequenceStep,
  enrollContact
} from './automation-controller.js';
import {
  getBlocks,
  createBlock,
  updateBlock,
  deleteBlock
} from './block-controller.js';
import {
  getTemplates,
  getTemplateById,
  getTemplateVariables,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  trackTemplateUse,
  getTemplateFolders,
  createTemplateFolder,
  updateTemplateFolder,
  deleteTemplateFolder
} from './template-controller.js';

export async function automationRoutes(app: FastifyInstance) {
  // Bật auth protection cho module automation
  app.addHook('preHandler', authMiddleware);

  // Blocks API
  app.get('/api/v1/automation/blocks', getBlocks);
  app.post('/api/v1/automation/blocks', createBlock);
  app.put('/api/v1/automation/blocks/:id', updateBlock);
  app.delete('/api/v1/automation/blocks/:id', deleteBlock);

  // Sequences API
  app.get('/api/v1/automation/sequences', getSequences);
  app.get('/api/v1/automation/sequences/:id', getSequenceDetail);
  app.post('/api/v1/automation/sequences', createSequence);
  app.put('/api/v1/automation/sequences/:id', updateSequence);
  app.post('/api/v1/automation/sequences/:id/steps', addSequenceStep);
  app.delete('/api/v1/automation/sequences/:id/steps/:stepId', deleteSequenceStep);
  app.post('/api/v1/automation/sequences/:id/enroll', enrollContact);

  // Message Templates API
  app.get('/api/v1/automation/templates', getTemplates);
  app.get('/api/v1/automation/templates/variables', getTemplateVariables);
  app.get('/api/v1/automation/templates/:id', getTemplateById);
  app.post('/api/v1/automation/templates', createTemplate);
  app.put('/api/v1/automation/templates/:id', updateTemplate);
  app.delete('/api/v1/automation/templates/:id', deleteTemplate);
  app.post('/api/v1/automation/templates/:id/track-use', trackTemplateUse);

  // Message Template Folders API
  app.get('/api/v1/automation/template-folders', getTemplateFolders);
  app.post('/api/v1/automation/template-folders', createTemplateFolder);
  app.put('/api/v1/automation/template-folders/:id', updateTemplateFolder);
  app.delete('/api/v1/automation/template-folders/:id', deleteTemplateFolder);
}

