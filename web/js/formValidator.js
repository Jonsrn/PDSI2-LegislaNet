/**
 * Provides reusable client-side form validation and error rendering.
 */
class FormValidator {
  constructor() {
    this.rules = {};
    this.messages = {};
    this.errors = {};

    this.patterns = {
      email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      password:
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      strongPassword:
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      municipio: /^[a-zA-ZÀ-ÿ\s\-']{2,100}$/,
      partidoNome: /^[a-zA-ZÀ-ÿ\s\-]{2,100}$/,
      partidoSigla: /^[A-Z0-9]{2,10}$/,
      nomeParlamentar: /^[a-zA-ZÀ-ÿ\s\-']{2,100}$/,
      url: /^https?:\/\/([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
      telefone: /^[\(\)\d\s\-\+]{10,20}$/,
    };

    this.defaultMessages = {
      required: "Este campo é obrigatório",
      email: "Formato de email inválido",
      password:
        "Senha deve ter ao menos 1 minúscula, 1 maiúscula, 1 número e 1 símbolo",
      strongPassword:
        "Senha deve ter ao menos 8 caracteres com 1 minúscula, 1 maiúscula, 1 número e 1 símbolo",
      minLength: "Deve ter pelo menos {min} caracteres",
      maxLength: "Deve ter no máximo {max} caracteres",
      min: "Valor mínimo é {min}",
      max: "Valor máximo é {max}",
      pattern: "Formato inválido",
      url: "URL deve começar com http:// ou https://",
      partidoSigla: "Sigla deve ter 2-10 caracteres maiúsculos e números",
      municipio: "Município deve conter apenas letras, espaços e hífens",
      telefone: "Formato de telefone inválido",
    };
  }

  /**
   * Registers validation rules and optional custom messages for a field.
   * @param {string} fieldName - Field name or ID.
   * @param {object} rules - Validation rules to apply.
   * @param {object} [customMessages={}] - Message overrides for this field.
   * @returns {FormValidator} Current validator instance for chaining.
   */
  setRules(fieldName, rules, customMessages = {}) {
    this.rules[fieldName] = rules;
    this.messages[fieldName] = { ...this.defaultMessages, ...customMessages };
    return this;
  }

  /**
   * Validates a single field value and optionally updates the field error UI.
   * @param {string} fieldName - Field name or ID.
   * @param {*} value - Value to validate.
   * @param {boolean|object} [showErrorOrOptions=true] - Whether to show UI errors, or validation options.
   * @param {object} [maybeOptions={}] - Validation options when the third argument is a boolean.
   * @param {'submit'|'realtime'} [maybeOptions.mode='submit'] - Validation mode.
   * @returns {boolean} True when the field is valid.
   */
  validateField(
    fieldName,
    value,
    showErrorOrOptions = true,
    maybeOptions = {}
  ) {
    const rules = this.rules[fieldName];
    if (!rules) return true;

    const options =
      typeof showErrorOrOptions === "object" && showErrorOrOptions !== null
        ? showErrorOrOptions
        : maybeOptions;
    const showError =
      typeof showErrorOrOptions === "boolean"
        ? showErrorOrOptions
        : options.showError ?? true;
    const mode = options.mode || "submit";

    const errors = [];

    if (typeof value === "string") {
      value = value.trim();
    }

    if (rules.required && this.isEmpty(value)) {
      // Avoid showing required errors while the user is actively clearing a field.
      if (mode === "realtime") {
        delete this.errors[fieldName];
        this.clearFieldError(fieldName);
        return true;
      }
      errors.push(this.messages[fieldName].required);
    }

    if (this.isEmpty(value) && !rules.required) {
      this.clearFieldError(fieldName);
      return true;
    }

    if (rules.email && !this.patterns.email.test(value)) {
      errors.push(this.messages[fieldName].email);
    }

    if (rules.password && !this.patterns.password.test(value)) {
      errors.push(this.messages[fieldName].password);
    }

    if (rules.strongPassword && !this.patterns.strongPassword.test(value)) {
      errors.push(this.messages[fieldName].strongPassword);
    }

    if (rules.url && value && !this.patterns.url.test(value)) {
      errors.push(this.messages[fieldName].url);
    }

    if (rules.minLength && value.length < rules.minLength) {
      errors.push(
        this.messages[fieldName].minLength.replace("{min}", rules.minLength)
      );
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(
        this.messages[fieldName].maxLength.replace("{max}", rules.maxLength)
      );
    }

    if (rules.min !== undefined) {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < rules.min) {
        errors.push(this.messages[fieldName].min.replace("{min}", rules.min));
      }
    }

    if (rules.max !== undefined) {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue > rules.max) {
        errors.push(this.messages[fieldName].max.replace("{max}", rules.max));
      }
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(this.messages[fieldName].pattern);
    }

    if (rules.custom && typeof rules.custom === "function") {
      const customError = rules.custom(value);
      if (customError) errors.push(customError);
    }

    if (rules.municipio && !this.patterns.municipio.test(value)) {
      errors.push(this.messages[fieldName].municipio);
    }

    if (rules.partidoNome && !this.patterns.partidoNome.test(value)) {
      errors.push("Nome deve conter apenas letras, espaços e hífens");
    }

    if (rules.partidoSigla && !this.patterns.partidoSigla.test(value)) {
      errors.push(this.messages[fieldName].partidoSigla);
    }

    if (rules.nomeParlamentar && !this.patterns.nomeParlamentar.test(value)) {
      errors.push(
        "Nome deve conter apenas letras, espaços, hífens e apóstrofes"
      );
    }

    if (rules.telefone && value && !this.patterns.telefone.test(value)) {
      errors.push(this.messages[fieldName].telefone);
    }

    if (errors.length > 0) {
      this.errors[fieldName] = errors;
      if (showError) this.showFieldError(fieldName, errors[0]);
      return false;
    } else {
      delete this.errors[fieldName];
      if (showError) this.clearFieldError(fieldName);
      return true;
    }
  }

  /**
   * Validates all registered fields within a form.
   * @param {string} formSelector - Selector for the form to validate.
   * @returns {boolean} True when all registered fields in the form are valid.
   */
  validateForm(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) return false;

    let isValid = true;
    this.errors = {};

    for (const fieldName in this.rules) {
      const field = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
      if (!field) continue;

      let value = field.value;

      if (field.type === "checkbox") {
        value = field.checked;
      } else if (field.type === "radio") {
        const checked = form.querySelector(`[name="${fieldName}"]:checked`);
        value = checked ? checked.value : "";
      } else if (field.type === "file") {
        value = field.files.length > 0 ? field.files[0] : null;
      }

      if (!this.validateField(fieldName, value)) {
        isValid = false;
      }
    }

    return isValid;
  }

  /**
   * Displays an error message for a field.
   * @param {string} fieldName - Field name or ID.
   * @param {string} message - Error message to display.
   * @returns {void}
   */
  showFieldError(fieldName, message) {
    const field = document.querySelector(
      `[name="${fieldName}"], #${fieldName}`
    );
    if (!field) return;

    this.clearFieldError(fieldName);

    field.classList.add("form-input-error");

    const errorElement = document.createElement("div");
    errorElement.className = "form-field-error";
    errorElement.textContent = message;
    errorElement.id = `error-${fieldName}`;

    const wrapper =
      field.closest(".form-group") || field.closest(".custom-select-wrapper");
    if (wrapper) {
      wrapper.appendChild(errorElement);
    } else {
      field.parentNode.insertBefore(errorElement, field.nextSibling);
    }

    if (Object.keys(this.errors).length === 1) {
      this.scrollToField(field);
    }
  }

  /**
   * Clears the displayed error for a field.
   * @param {string} fieldName - Field name or ID.
   * @returns {void}
   */
  clearFieldError(fieldName) {
    const field = document.querySelector(
      `[name="${fieldName}"], #${fieldName}`
    );
    if (!field) return;

    field.classList.remove("form-input-error");

    const errorElement = document.getElementById(`error-${fieldName}`);
    if (errorElement) {
      errorElement.remove();
    }
  }

  /**
   * Clears all tracked errors and removes error UI from the page.
   * @returns {void}
   */
  clearAllErrors() {
    this.errors = {};

    document.querySelectorAll(".form-input-error").forEach((el) => {
      el.classList.remove("form-input-error");
    });

    document.querySelectorAll(".form-field-error").forEach((el) => {
      el.remove();
    });
  }

  /**
   * Scrolls to a field and focuses it after a short delay.
   * @param {HTMLElement} field - Field element to reveal.
   * @returns {void}
   */
  scrollToField(field) {
    const rect = field.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

    if (!isVisible) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    setTimeout(() => {
      field.focus();
    }, 300);
  }

  /**
   * Checks whether a value should be considered empty for validation.
   * @param {*} value - Value to inspect.
   * @returns {boolean} True when the value is empty.
   */
  isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (typeof value === "boolean") return false;
    if (typeof value === "number") return isNaN(value);
    if (value instanceof File) return false;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  /**
   * Sanitizes a string by removing script, iframe, JavaScript URL, and event-handler content.
   * @param {*} value - Value to sanitize.
   * @returns {*} Sanitized string, or the original value for non-string inputs.
   */
  sanitize(value) {
    if (typeof value !== "string") return value;

    return value
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "");
  }

  /**
   * Gets a shallow copy of the current validation errors.
   * @returns {object} Current errors by field.
   */
  getErrors() {
    return { ...this.errors };
  }

  /**
   * Checks whether any validation errors are currently tracked.
   * @returns {boolean} True when at least one field has errors.
   */
  hasErrors() {
    return Object.keys(this.errors).length > 0;
  }

  /**
   * Renders a summary of the current errors into a container.
   * @param {string} [container='.form-errors'] - Selector for the error summary container.
   * @returns {void}
   */
  showErrorSummary(container = ".form-errors") {
    const errorContainer = document.querySelector(container);
    if (!errorContainer || !this.hasErrors()) return;

    const errorList = Object.entries(this.errors)
      .map(([field, errors]) => errors[0])
      .join("<br>");

    errorContainer.innerHTML = `
            <div class="alert alert-error">
                <strong>Corrija os seguintes erros:</strong><br>
                ${errorList}
            </div>
        `;

    errorContainer.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

window.formValidator = new FormValidator();

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("input", (e) => {
    const field = e.target;
    if (field.hasAttribute("data-validate")) {
      const fieldName = field.name || field.id;
      if (fieldName && window.formValidator.rules[fieldName]) {
        window.formValidator.validateField(fieldName, field.value, {
          mode: "realtime",
        });
      }
    }
  });

  document.addEventListener("blur", (e) => {
    const field = e.target;
    if (
      field.classList.contains("form-input") ||
      field.classList.contains("form-select")
    ) {
      const fieldName = field.name || field.id;
      if (fieldName && window.formValidator.rules[fieldName]) {
        window.formValidator.validateField(fieldName, field.value, {
          mode: "realtime",
        });
      }
    }
  });
});
