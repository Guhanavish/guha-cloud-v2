const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { 
  createFolder, 
  getFolders, 
  getFolder, 
  updateFolder, 
  deleteFolder, 
  moveFolder 
} = require('../controllers/folderController');
const { folderValidation, idParamValidation, moveValidation, paginationValidation } = require('../middleware/validation');

router.use(authenticate);

router.post('/', folderValidation, createFolder);
router.get('/', paginationValidation, getFolders);
router.get('/:id', idParamValidation, getFolder);
router.put('/:id', idParamValidation, folderValidation, updateFolder);
router.put('/:id/move', idParamValidation, moveValidation, moveFolder);
router.delete('/:id', idParamValidation, deleteFolder);

module.exports = router;