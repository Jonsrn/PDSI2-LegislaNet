/**
 * Pagination control helpers.
 *
 * @module web/js/pagination
 */

/**
 * Renders carousel-style pagination controls.
 *
 * @param {object} config - Pagination configuration.
 * @param {string} config.containerId - Container id where controls are rendered.
 * @param {number} config.currentPage - Current page, starting at 1.
 * @param {number} config.totalItems - Total item count.
 * @param {number} config.itemsPerPage - Items per page.
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
        const paginationWrapper = container.closest('.pagination-container');
        if (paginationWrapper) paginationWrapper.style.display = 'none';
        return;
    }

    const paginationWrapper = container.closest('.pagination-container');
    if (paginationWrapper) paginationWrapper.style.display = 'flex';

    container.className = 'pagination-controls';

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

    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'pagination-pages';

    const pagesToShow = calculatePagesToShow(currentPage, totalPages);

    pagesToShow.forEach((page) => {
        if (page === '...') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pagesContainer.appendChild(ellipsis);
        } else {
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

    container.appendChild(prevBtn);
    container.appendChild(pagesContainer);
    container.appendChild(nextBtn);
}

/**
 * Calculates which page numbers and ellipses should be shown.
 *
 * @param {number} currentPage - Current page, starting at 1.
 * @param {number} totalPages - Total page count.
 * @returns {Array<number|string>} Page numbers and ellipsis markers to render.
 */
function calculatePagesToShow(currentPage, totalPages) {
    const pages = [];
    const maxPagesToShow = 7;

    if (totalPages <= maxPagesToShow) {
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        pages.push(1);

        if (currentPage > 3) {
            pages.push('...');
        }

        const startPage = Math.max(2, currentPage - 1);
        const endPage = Math.min(totalPages - 1, currentPage + 1);

        for (let i = startPage; i <= endPage; i++) {
            if (!pages.includes(i)) {
                pages.push(i);
            }
        }

        if (currentPage < totalPages - 2) {
            pages.push('...');
        }

        if (!pages.includes(totalPages)) {
            pages.push(totalPages);
        }
    }

    return pages;
}
