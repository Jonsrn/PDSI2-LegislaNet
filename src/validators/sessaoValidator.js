const { body } = require("express-validator");

/**
 * Validation rules for sessao records.
 *
 * @module validators/sessaoValidator
 */

/**
 * Express-validator rules for session scheduling data.
 */
const sessaoValidation = [
  body("numero")
    .isInt({ min: 1, max: 999 })
    .withMessage("O número da sessão deve ser um inteiro entre 1 e 999."),

  body("tipo")
    .isIn(["Ordinária", "Extraordinária", "Solene"])
    .withMessage("O tipo de sessão é inválido."),

  body("status")
    .optional()
    .isIn(["Agendada", "Em Andamento", "Finalizada"])
    .withMessage("O status da sessão é inválido."),

  body("data_sessao")
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage(
      "A data e hora devem estar no formato ISO 8601 (AAAA-MM-DDTHH:MM).",
    )
    .custom((value) => {
      if (!value) return true;

      let dateToCompare;

      // Treat timezone-less datetime-local values as Brasília time.
      if (value.includes("Z") || value.match(/[+-]\d{2}:\d{2}$/)) {
        dateToCompare = new Date(value);
      } else {
        dateToCompare = new Date(`${value}-03:00`);
      }

      const now = new Date();
      const tolerance = 5 * 60 * 1000;

      if (dateToCompare.getTime() < now.getTime() - tolerance) {
        throw new Error(
          "A data da sessão não pode ser no passado (tolerância de 5 min).",
        );
      }

      return true;
    }),
];

module.exports = {
  sessaoValidation,
};
