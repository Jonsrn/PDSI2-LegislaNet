/**
 * File: customSelect.js
 * Purpose: Provides a reusable custom select component with support for
 * manual instantiation, dynamic option population, selection callbacks,
 * and automatic initialization through data attributes.
 */

/**
 * Manages a custom select UI backed by a hidden input element.
 */
class CustomSelect {
  /**
   * Creates a new custom select instance and resolves its DOM dependencies.
   * @param {Object} config - Component configuration options.
   * @param {string} config.wrapperId - The ID of the wrapper element.
   * @param {string} [config.hiddenInputSelector] - Selector for the hidden input element.
   * @param {string} [config.triggerSelector] - Selector for the trigger element.
   * @param {string} [config.optionsSelector] - Selector for the options container.
   * @param {string} [config.placeholder] - Placeholder text shown when no option is selected.
   * @param {Function} [config.onSelect] - Callback invoked after an option is selected.
   * @returns {void}
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
   * Initializes event listeners and restores the current selected value.
   * @returns {void}
   */
  init() {
    console.log("CustomSelect init() chamado");
    // Event listener para abrir/fechar dropdown
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

    // Listener de seleção das opções (funciona com opções no HTML e com populateOptions)
    this.bindOptionsListener();

    // Se já houver valor no hidden input, refletir no trigger
    if (this.hiddenInput && this.hiddenInput.value) {
      this.setValue(this.hiddenInput.value);
    }

    // Event listener global para fechar dropdowns ao clicar fora
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
   * Closes every open custom select dropdown in the document.
   * @returns {void}
   */
  closeAllDropdowns() {
    document.querySelectorAll(".custom-options.open").forEach((dropdown) => {
      dropdown.classList.remove("open");
    });
  }

  /**
   * Closes every open custom select dropdown using the static helper.
   * @returns {void}
   */
  static closeAllDropdownsStatic() {
    document.querySelectorAll(".custom-options.open").forEach((dropdown) => {
      dropdown.classList.remove("open");
    });
  }

  /**
   * Binds the delegated click listener used to handle option selection.
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
   * Replaces the current option list with the provided option set.
   * @param {Array<Object>} options - The options to render.
   * @param {string|number} options[].value - The value stored in the hidden input.
   * @param {string} options[].text - The visible option label.
   * @param {string} [options[].image] - Optional image URL displayed with the option.
   * @param {string} [options[].alt] - Optional alternative text for the image.
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

      // Se tem imagem, adicionar
      if (option.image) {
        optionElement.innerHTML = `<img src="${option.image}" alt="${
          option.alt || ""
        }">${option.text}`;
      } else {
        optionElement.innerHTML = `<span>${option.text}</span>`;
      }

      this.optionsContainer.appendChild(optionElement);
    });

    // Re-binda o listener (já que o innerHTML foi recriado)
    delete this.optionsContainer.dataset.bound;
    this.bindOptionsListener();
  }

  /**
   * Applies the selected option to the hidden input and trigger UI.
   * @param {Object} option - The option to select.
   * @param {string|number} option.value - The value stored in the hidden input.
   * @param {string} option.text - The visible option label.
   * @param {string} [option.image] - Optional image URL displayed in the trigger.
   * @param {string} [option.alt] - Optional alternative text for the image.
   * @returns {void}
   */
  selectOption(option) {
    // Atualizar valor do input hidden
    this.hiddenInput.value = option.value;

    // Atualizar visual do trigger
    if (option.image) {
      this.trigger.innerHTML = `<img src="${option.image}" alt="${
        option.alt || ""
      }">${option.text}`;
    } else {
      this.trigger.innerHTML = `<span>${option.text}</span>`;
    }

    // Atualizar classes de seleção
    this.optionsContainer.querySelectorAll(".custom-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
    const selectedElement = this.optionsContainer.querySelector(
      `[data-value="${option.value}"]`
    );
    if (selectedElement) {
      selectedElement.classList.add("selected");
    }

    // Fechar dropdown
    this.optionsContainer.classList.remove("open");

    // Callback customizado
    this.onSelect(option);
  }

  /**
   * Selects an option by its stored value.
   * @param {string|number} value - The option value to apply.
   * @returns {void}
   */
  setValue(value) {
    const option = this.optionsContainer.querySelector(
      `[data-value="${value}"]`
    );
    if (option) {
      // Encontrar a opção correspondente e selecionar
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
   * Clears the current selection and restores the placeholder state.
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
   * Rebinds option listeners and reapplies the current visual selection.
   * @returns {void}
   */
  reinitialize() {
    // Permite reconfigurar após inserir/remover opções no DOM
    if (!this.optionsContainer) return;
    delete this.optionsContainer.dataset.bound;
    this.bindOptionsListener();

    // Reaplicar seleção visual se já houver valor
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
   * Returns the currently selected value.
   * @returns {string}
   */
  getValue() {
    return this.hiddenInput.value;
  }
}

/**
 * Automatically initializes custom selects declared with data attributes.
 * @returns {void}
 */
document.addEventListener("DOMContentLoaded", () => {
  // Auto-inicializar selects com data-custom-select
  document.querySelectorAll("[data-custom-select]").forEach((wrapper) => {
    const config = JSON.parse(wrapper.dataset.customSelect || "{}");
    config.wrapperId = wrapper.id;
    new CustomSelect(config);
  });
});

// Export the class for manual usage in page scripts.
window.CustomSelect = CustomSelect;
