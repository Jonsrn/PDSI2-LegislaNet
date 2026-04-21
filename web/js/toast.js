/**
 * File: toast.js
 * Purpose: Provides a lightweight toast notification helper for displaying
 * transient success, error, warning, and informational messages.
 */
/**
 * Displays a toast notification with an icon and auto-dismiss behavior.
 * @param {string} message - The message to display inside the toast.
 * @param {string} [type='info'] - The semantic toast type.
 * @param {number} [duration=5000] - Duration in milliseconds before dismissal.
 * @returns {void}
 */
function showToast(message, type = 'info', duration = 5000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    const iconClass = icons[type] || 'fa-info-circle';

    toast.innerHTML = `
        <i class="toast-icon fa-solid ${iconClass}"></i>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}
