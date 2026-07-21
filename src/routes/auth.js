const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginValidation, passwordValidation } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

router.post('/login', loginValidation, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getMe);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/username', authenticate, authController.changeUsername);
router.put('/password', authenticate, passwordValidation, authController.changePassword);
router.delete('/account', authenticate, passwordValidation, authController.deleteAccount);

module.exports = router;