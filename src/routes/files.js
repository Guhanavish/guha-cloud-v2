const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const folderController = require('../controllers/folderController');
const { handleUpload, handleMultipleUpload, MAX_FILE_SIZE } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const { idParamValidation, paginationValidation, renameValidation, moveValidation, folderValidation } = require('../middleware/validation');

router.use(authenticate);

router.get('/stats', fileController.getStorageStats);
router.get('/recycle', fileController.getRecycleBin);
router.get('/search', paginationValidation, fileController.searchFiles);
router.get('/', paginationValidation, fileController.getFiles);
router.post('/upload', handleMultipleUpload, fileController.uploadFiles);
router.get('/:id', idParamValidation, fileController.getFile);
router.get('/:id/download', idParamValidation, fileController.downloadFile);
router.put('/:id', idParamValidation, renameValidation, fileController.renameFile);
router.put('/:id/move', idParamValidation, moveValidation, fileController.moveFile);
router.post('/:id/restore', idParamValidation, fileController.restoreFile);
router.delete('/:id/forever', idParamValidation, fileController.permanentDeleteFile);
router.delete('/:id', idParamValidation, fileController.deleteFile);

router.post('/folders', folderValidation, folderController.createFolder);
router.get('/folders', folderController.getFolders);
router.get('/folders/:id', idParamValidation, folderController.getFolder);
router.put('/folders/:id', idParamValidation, folderValidation, folderController.updateFolder);
router.put('/folders/:id/move', idParamValidation, moveValidation, folderController.moveFolder);
router.delete('/folders/:id', idParamValidation, folderController.deleteFolder);

module.exports = router;