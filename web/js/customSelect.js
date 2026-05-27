/**
 * Modular custom select component for form controls.
 *
 * @module web/js/customSelect
 */

/**
 * Replaces a native hidden input/select pattern with a custom dropdown UI.
 */
class CustomSelect {
  /**
   * Creates a custom select bound to an existing wrapper element.
   *
   * @param {object} config - Custom select configuration.
   * @param {string} config.wrapperId - ID of the wrapper element.
   * @param {string} [config.hiddenInputSelector] - Selector for the hidden input.
   * @param {string} [config.triggerSelector] - Selector for the dropdown trigger.
   * @param {string} [config.optionsSelector] - Selector for the options container.
   * @param {string} [config.placeholder] - Placeholder displayed when no option is selected.
   * @param {Function} [config.onSelect] - Callback invoked after an option is selected.
   */
  constructor(config) {
    console.log("CustomSelect constructor chamado com config:", config);
    this.wrapper = document.getElementById(config.wrapperId);
    console.log("Wrapper encontrado:", this.wrapper);

    if (!this.wrapper) {
      console.error("Wrapper não encontrado para ID:", config.wrapperId);
      return;
    }

    this.hiddenInput = this.wrapper.querySelector(
      config.hiddenInputSelector || 'input[type="hidden"]'
    );
    this.trigger = this.wrapper.querySelector(
      config.triggerSelector || ".custom-select-trigger"
    );
    this.optionsContainer = this.wrapper.querySelector(
      config.optionsSelector || ".custom-options"
    );

    console.log("Elementos encontrados:", {
      hiddenInput: this.hiddenInput,
      trigger: this.trigger,
      optionsContainer: this.optionsContainer,
    });

    this.placeholder = config.placeholder || "Selecione...";
    this.onSelect = config.onSelect || (() => {});

    if (this.trigger && this.optionsContainer) {
      this.init();
    } else {
      console.error("Elementos necessários não encontrados");
    }
  }

  /**
   * Initializes DOM listeners and applies any existing hidden input value.
   *
   * @returns {void}
   */
  init() {
    console.log("CustomSelect init() chamado");
    this.trigger.addEventListener("click", (e) => {
      console.log("CustomSelect trigger clicado");
      e.stopPropagation();
      const isOpen = this.optionsContainer.classList.contains("open");
      console.log("Dropdown aberto?", isOpen);
      this.closeAllDropdowns();
      if (!isOpen) {
        this.optionsContainer.classList.add("open");
        console.log("Dropdown aberto");
      }
    });

    this.bindOptionsListener();

    if (this.hiddenInput && this.hiddenInput.value) {
      this.setValue(this.hiddenInput.value);
    }

    if (!CustomSelect.globalListenerAdded) {
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".custom-select-wrapper")) {
          CustomSelect.closeAllDropdownsStatic();
        }
      });
      CustomSelect.globalListenerAdded = true;
    }
  }

  /**
   * Closes all open custom select dropdowns.
   *
   * @returns {void}
   */
  closeAllDropdowns() {
    document.querySelectorAll(".custom-options.open").forEach((dropdown) => {
      dropdown.classList.remove("open");
    });
  }

  /**
   * Closes all open custom select dropdowns without an instance reference.
   *
   * @returns {void}
   */
  static closeAllDropdownsStatic() {
    document.querySelectorAll(".custom-options.open").forEach((dropdown) => {
      dropdown.classList.remove("open");
    });
  }

  /**
   * Binds click handling for option selection.
   *
   * @returns {void}
   */
  bindOptionsListener() {
    if (!this.optionsContainer) return;
    if (this.optionsContainer.dataset.bound === "true") return;

    this.optionsContainer.addEventListener("click", (e) => {
      const optionElement = e.target.closest(".custom-option");
      if (!optionElement) return;

      e.stopPropagation();

      const value = optionElement.dataset.value ?? "";
      const img = optionElement.querySelector("img");

      const textFromSpan = optionElement.querySelector("span")?.textContent;
      const text = (textFromSpan || optionElement.textContent || "").trim();

      this.selectOption({
        value,
        text,
        image: img?.getAttribute("src") || undefined,
        alt: img?.getAttribute("alt") || undefined,
      });
    });

    this.optionsContainer.dataset.bound = "true";
  }

  /**
   * Replaces the dropdown options with a new option list.
   *
   * @param {Array<object>} options - Options to render.
   * @returns {void}
   */
  populateOptions(options) {
    this.optionsContainer.innerHTML = "";

    if (!options || options.length === 0) {
      this.optionsContainer.innerHTML =
        '<div class="custom-option-placeholder">Nenhuma opção disponível</div>';
      return;
    }

    options.forEach((option) => {
      const optionElement = document.createElement("div");
      optionElement.className = "custom-option";
      optionElement.dataset.value = option.value;

      if (option.image) {
        optionElement.innerHTML = `<img src="${option.image}" alt="${
          option.alt || ""
        }">${option.text}`;
      } else {
        optionElement.innerHTML = `<span>${option.text}</span>`;
      }

      this.optionsContainer.appendChild(optionElement);
    });

    delete this.optionsContainer.dataset.bound;
    this.bindOptionsListener();
  }

  /**
   * Selects an option, updates the hidden input, and refreshes the trigger UI.
   *
   * @param {object} option - Selected option data.
   * @param {string} option.value - Option value.
   * @param {string} option.text - Option label.
   * @param {string} [option.image] - Optional image URL.
   * @param {string} [option.alt] - Optional image alt text.
   * @returns {void}
   */
  selectOption(option) {
    this.hiddenInput.value = option.value;

    if (option.image) {
      this.trigger.innerHTML = `<img src="${option.image}" alt="${
        option.alt || ""
      }">${option.text}`;
    } else {
      this.trigger.innerHTML = `<span>${option.text}</span>`;
    }

    this.optionsContainer.querySelectorAll(".custom-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
    const selectedElement = this.optionsContainer.querySelector(
      `[data-value="${option.value}"]`
    );
    if (selectedElement) {
      selectedElement.classList.add("selected");
    }

    this.optionsContainer.classList.remove("open");

    this.onSelect(option);
  }

  /**
   * Selects an option by value or resets the component when no match exists.
   *
   * @param {string} value - Option value to select.
   * @returns {void}
   */
  setValue(value) {
    const option = this.optionsContainer.querySelector(
      `[data-value="${value}"]`
    );
    if (option) {
      const optionData = {
        value: value,
        text: option.textContent,
        image: option.querySelector("img")?.src,
        alt: option.querySelector("img")?.alt,
      };
      this.selectOption(optionData);
    } else {
      this.reset();
    }
  }

  /**
   * Clears the current selection and restores the placeholder.
   *
   * @returns {void}
   */
  reset() {
    this.hiddenInput.value = "";
    this.trigger.innerHTML = `<span>${this.placeholder}</span>`;
    this.optionsContainer.querySelectorAll(".custom-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
  }

  /**
   * Rebinds option listeners and reapplies visual selection after DOM changes.
   *
   * @returns {void}
   */
  reinitialize() {
    if (!this.optionsContainer) return;
    delete this.optionsContainer.dataset.bound;
    this.bindOptionsListener();

    if (this.hiddenInput && this.hiddenInput.value) {
      const currentValue = this.hiddenInput.value;
      const optionElement = this.optionsContainer.querySelector(
        `[data-value="${currentValue}"]`
      );
      if (optionElement) {
        this.optionsContainer
          .querySelectorAll(".custom-option")
          .forEach((opt) => opt.classList.remove("selected"));
        optionElement.classList.add("selected");
      }
    }
  }

  /**
   * Returns the current hidden input value.
   *
   * @returns {string} Current selected value.
   */
  getValue() {
    return this.hiddenInput.value;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-custom-select]").forEach((wrapper) => {
    const config = JSON.parse(wrapper.dataset.customSelect || "{}");
    config.wrapperId = wrapper.id;
    new CustomSelect(config);
  });
});

window.CustomSelect = CustomSelect;
