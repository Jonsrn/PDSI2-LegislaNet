const express = require('express');
const router = express.Router({ mergeParams: true });
const userController = require('../controllers/userController');
const { isSuperAdmin } = require('../middleware/authMiddleware');

/**
 * Super-admin user credential routes.
 *
 * @module routes/userRoutes
 */

router.use(isSuperAdmin);

/**
 * @route   GET /api/camaras/:camaraId/users
 * @desc    List user credentials for a camara.
 * @access  Private (Super Admin)
 */
router.get('/', userController.getUsersByCamara);


const singleUserRouter = express.Router();

/**
 * @route   PUT /api/users/:id
 * @desc    Update user credentials.
 * @access  Private (Super Admin)
 */
singleUserRouter.put('/:id', isSuperAdmin, userController.updateUser);


module.exports = { 
    nestedUserRouter: router, 
    singleUserRouter: singleUserRouter 
};
