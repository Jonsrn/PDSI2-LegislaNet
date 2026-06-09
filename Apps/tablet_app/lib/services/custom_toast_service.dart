import 'package:flutter/material.dart';

/// Displays app-level overlay toasts for voting, connection, error, and info events.
class CustomToastService {
  static OverlayEntry? _overlayEntry;
  static bool _isShowing = false;

  /// Shows a vote toast using the color and icon associated with [voto].
  static void showVoteToast(
    BuildContext context,
    String message,
    String voto,
  ) {
    if (_isShowing) {
      _hideToast();
    }

    Color backgroundColor;
    IconData icon;
    Color iconColor = Colors.white;

    switch (voto) {
      case 'SIM':
        backgroundColor = const Color(0xFF2EA043);
        icon = Icons.thumb_up_rounded;
        break;
      case 'NÃO':
        backgroundColor = const Color(0xFFDA3633);
        icon = Icons.thumb_down_rounded;
        break;
      case 'ABSTENÇÃO':
        backgroundColor = const Color(0xFFF08833);
        icon = Icons.remove_circle_outline_rounded;
        break;
      default:
        backgroundColor = const Color(0xFF58a6ff);
        icon = Icons.info_outline_rounded;
    }

    _showCustomToast(
      context,
      message,
      backgroundColor,
      icon,
      iconColor,
    );
  }

  /// Shows a connection-status toast.
  static void showConnectionToast(
    BuildContext context,
    String message, {
    required bool isPositive,
  }) {
    if (_isShowing) {
      _hideToast();
    }

    _showCustomToast(
      context,
      message,
      isPositive
        ? const Color(0xFF2EA043)
        : const Color(0xFF6b7280),
      isPositive ? Icons.wifi_rounded : Icons.wifi_off_rounded,
      Colors.white,
    );
  }

  /// Shows an error toast.
  static void showErrorToast(
    BuildContext context,
    String message,
  ) {
    if (_isShowing) {
      _hideToast();
    }

    _showCustomToast(
      context,
      message,
      const Color(0xFFDA3633),
      Icons.error_outline_rounded,
      Colors.white,
    );
  }

  /// Shows an informational toast.
  static void showInfoToast(
    BuildContext context,
    String message,
  ) {
    if (_isShowing) {
      _hideToast();
    }

    _showCustomToast(
      context,
      message,
      const Color(0xFF58a6ff),
      Icons.info_outline_rounded,
      Colors.white,
    );
  }

  /// Inserts the toast overlay and schedules automatic dismissal.
  static void _showCustomToast(
    BuildContext context,
    String message,
    Color backgroundColor,
    IconData icon,
    Color iconColor,
  ) {
    final overlay = Overlay.of(context);
    _isShowing = true;

    _overlayEntry = OverlayEntry(
      builder: (context) => Positioned(
        top: MediaQuery.of(context).padding.top + 20,
        right: 20,
        left: 20,
        child: Material(
          color: Colors.transparent,
          child: TweenAnimationBuilder<double>(
            duration: const Duration(milliseconds: 300),
            tween: Tween(begin: 0.0, end: 1.0),
            builder: (context, value, child) => Transform.translate(
              offset: Offset(100 * (1 - value), 0),
              child: Opacity(
                opacity: value,
                child: child,
              ),
            ),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 400),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: backgroundColor,
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      icon,
                      color: iconColor,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      message,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    overlay.insert(_overlayEntry!);

    Future.delayed(const Duration(milliseconds: 2500), () {
      _hideToast();
    });
  }

  /// Removes the current toast overlay if one is visible.
  static void _hideToast() {
    if (_overlayEntry != null && _isShowing) {
      _overlayEntry!.remove();
      _overlayEntry = null;
      _isShowing = false;
    }
  }

  /// Whether a toast overlay is currently visible.
  static bool get isShowing => _isShowing;

  /// Clears any active toast overlay.
  static void clear() {
    _hideToast();
  }
}
