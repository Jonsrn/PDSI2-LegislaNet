/**
 * File: carregamento.js
 * Purpose: Provides reusable UI state renderers for loading, empty, and error
 * feedback inside dynamic container elements.
 */

/**
 * Renders a loading state inside the provided container element.
 * @param {HTMLElement} containerElement - The container where the loading UI will be displayed.
 * @param {string} [message='Carregando...'] - The message shown below the spinner.
 * @returns {void}
 */
function renderLoadingState(containerElement, message = "Carregando...") {
  if (!containerElement) {
    console.error(
      "Elemento container para o estado de carregamento não foi fornecido."
    );
    return;
  }

  const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>${message}</p>
        </div>
    `;
  containerElement.innerHTML = loadingHTML;
  // ESSENCIAL: Define o contêiner como um bloco simples durante o carregamento.
  containerElement.style.display = "block";
}

/**
 * Renders an empty state when no items are available for display.
 * @param {HTMLElement} containerElement - The target container element.
 * @param {string} [message='Nenhum item encontrado.'] - The main empty-state message.
 * @param {string} [iconClass='fa-solid fa-inbox'] - The Font Awesome icon class to display.
 * @returns {void}
 */
function renderEmptyState(
  containerElement,
  message = "Nenhum item encontrado.",
  iconClass = "fa-solid fa-inbox"
) {
  if (!containerElement) return;
  containerElement.innerHTML = `
        <div class="empty-state">
            <i class="${iconClass}"></i>
            <p>${message}</p>
        </div>
    `;
  // ESSENCIAL: Garante que o contêiner seja um bloco simples.
  containerElement.style.display = "block";
}

/**
 * Renders an error state inside the provided container element.
 * @param {HTMLElement} containerElement - The target container element.
 * @param {string} [message='Ocorreu um erro ao carregar os dados.'] - The error message to display.
 * @returns {void}
 */
function renderErrorState(
  containerElement,
  message = "Ocorreu um erro ao carregar os dados."
) {
  if (!containerElement) return;
  containerElement.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-exclamation-triangle"></i>
            <p style="color: var(--accent-red);">${message}</p>
        </div>
    `;
  // ESSENCIAL: Garante que o contêiner seja um bloco simples.
  containerElement.style.display = "block";
}
