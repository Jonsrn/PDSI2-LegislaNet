/**
 * File: pagination.js
 * Purpose: Provides reusable pagination control rendering for list and grid
 * interfaces, including previous/next navigation and compact page ranges.
 */

/**
 * Creates pagination controls with previous/next buttons and page number items.
 * @param {Object} config - Pagination configuration.
 * @param {string} config.containerId - ID of the container where controls will be rendered.
 * @param {number} config.currentPage - Current page number, starting at 1.
 * @param {number} config.totalItems - Total number of items.
 * @param {number} config.itemsPerPage - Number of items per page.
 * @param {Function} config.onPageChange - Callback invoked when the page changes.
 * @returns {void}
 */
function createPaginationControls({
    containerId,
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange
}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) {
        // Oculta o container se não houver páginas
        const paginationWrapper = container.closest('.pagination-container');
        if (paginationWrapper) paginationWrapper.style.display = 'none';
        return;
    }

    // Garante que o container está visível
    const paginationWrapper = container.closest('.pagination-container');
    if (paginationWrapper) paginationWrapper.style.display = 'flex';

    // Limpa classes antigas e adiciona nova classe estilo carrossel
    container.className = 'pagination-controls';

    // Criar botão anterior (estilo carrossel circular)
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    if (currentPage === 1) {
        prevBtn.classList.add('disabled');
    }
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    });

    // Criar container de numeração de páginas
    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'pagination-pages';

    // Lógica para determinar quais páginas mostrar
    const pagesToShow = calculatePagesToShow(currentPage, totalPages);

    // Criar botões de página
    pagesToShow.forEach((page) => {
        if (page === '...') {
            // Criar ellipsis
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pagesContainer.appendChild(ellipsis);
        } else {
            // Criar botão de página
            const pageBtn = document.createElement('button');
            pageBtn.className = 'pagination-page-btn';
            pageBtn.textContent = page;

            if (page === currentPage) {
                pageBtn.classList.add('active');
            }

            pageBtn.addEventListener('click', () => {
                onPageChange(page);
            });

            pagesContainer.appendChild(pageBtn);
        }
    });

    // Criar botão próximo (estilo carrossel circular)
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    if (currentPage === totalPages) {
        nextBtn.classList.add('disabled');
    }
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    });

    // Montar estrutura: Botão Anterior | Numeração | Botão Próximo
    container.appendChild(prevBtn);
    container.appendChild(pagesContainer);
    container.appendChild(nextBtn);
}

/**
 * Calculates the page items that should be displayed in the pagination control.
 * @param {number} currentPage - Current page number.
 * @param {number} totalPages - Total number of pages.
 * @returns {(number|string)[]}
 */
function calculatePagesToShow(currentPage, totalPages) {
    const pages = [];
    const maxPagesToShow = 7; // Número máximo de botões de página visíveis

    if (totalPages <= maxPagesToShow) {
        // Se tiver poucas páginas, mostra todas
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        // Lógica para muitas páginas: sempre mostra primeira, última, atual e adjacentes

        // Sempre adiciona a primeira página
        pages.push(1);

        if (currentPage > 3) {
            // Adiciona ellipsis se a página atual estiver longe do início
            pages.push('...');
        }

        // Adiciona páginas ao redor da atual
        const startPage = Math.max(2, currentPage - 1);
        const endPage = Math.min(totalPages - 1, currentPage + 1);

        for (let i = startPage; i <= endPage; i++) {
            if (!pages.includes(i)) {
                pages.push(i);
            }
        }

        if (currentPage < totalPages - 2) {
            // Adiciona ellipsis se a página atual estiver longe do final
            pages.push('...');
        }

        // Sempre adiciona a última página
        if (!pages.includes(totalPages)) {
            pages.push(totalPages);
        }
    }

    return pages;
}
