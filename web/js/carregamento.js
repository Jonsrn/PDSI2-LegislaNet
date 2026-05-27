/**
 * UI helpers for rendering loading, empty, and error states.
 *
 * @module web/js/carregamento
 */

/**
 * Renders a loading state inside a container.
 *
 * @param {HTMLElement} containerElement - Container where the loading state is rendered.
 * @param {string} [message='Carregando...'] - Message displayed below the spinner.
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
  containerElement.style.display = "block";
}

/**
 * Renders an empty state inside a container.
 *
 * @param {HTMLElement} containerElement - Container where the empty state is rendered.
 * @param {string} [message='Nenhum item encontrado.'] - Main message.
 * @param {string} [iconClass='fa-solid fa-inbox'] - Font Awesome icon class.
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
  containerElement.style.display = "block";
}

/**
 * Renders an error state inside a container.
 *
 * @param {HTMLElement} containerElement - Container where the error state is rendered.
 * @param {string} [message='Ocorreu um erro ao carregar os dados.'] - Error message.
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
  containerElement.style.display = "block";
}
