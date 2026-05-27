/**
 * Form UI helpers for file-name display and password visibility toggles.
 *
 * @module web/js/forms
 */

document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("file-input");
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      const fileNameEl = document.getElementById("file-name");
      if (fileNameEl) {
        fileNameEl.textContent = this.files[0]
          ? this.files[0].name
          : "Nenhum arquivo selecionado.";
      }
    });
  }

  const passwordToggles = document.querySelectorAll(
    ".password-toggle, .password-toggle-btn"
  );
  passwordToggles.forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.closest(".password-group");
      if (group) {
        const input = group.querySelector(
          'input[type="password"], input[type="text"]'
        );
        if (input) {
          togglePassword(input.id);
        }
      }
    });
  });
});

/**
 * Toggles password visibility for an input and updates its icon state.
 *
 * @param {string} inputId - Password input element id.
 * @returns {void}
 */
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const button = input
    .closest(".password-group")
    .querySelector(".password-toggle-btn, .password-toggle");
  if (!button) return;

  const icon = button.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    if (icon) {
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    }
  } else {
    input.type = "password";
    if (icon) {
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  }
}
