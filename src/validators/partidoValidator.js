const { body } = require('express-validator');

/**
 * Validation rules for partido records.
 *
 * @module validators/partidoValidator
 */

/**
 * Sanitizes user-provided strings by removing common script injection vectors
 * and enforcing a maximum length.
 *
 * @param {*} str - Value to sanitize.
 * @returns {*} Sanitized string, or the original value when it is not a string.
 */
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;

    return str
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .substring(0, 1000);
};

/**
 * Express-validator rules for partido data.
 */
const partidoValidation = [
    body('nome')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Nome deve ter entre 2 e 100 caracteres')
        .matches(/^[a-zA-ZÀ-ÿ\s\-]+$/)
        .withMessage('Nome só pode conter letras, espaços e hífens')
        .customSanitizer(sanitizeString),

    body('sigla')
        .trim()
        .customSanitizer(value => value ? value.toUpperCase() : value)
        .isLength({ min: 2, max: 10 })
        .withMessage('Sigla deve ter entre 2 e 10 caracteres')
        .matches(/^[A-Z0-9]+$/)
        .withMessage('Sigla só pode conter letras maiúsculas e números')
        .customSanitizer(sanitizeString)
];

module.exports = {
    partidoValidation
};
