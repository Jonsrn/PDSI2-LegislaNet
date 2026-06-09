import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'package:fluttertoast/fluttertoast.dart';
import 'package:flutter/material.dart';
import 'auth_service.dart';
import 'custom_toast_service.dart';

/// Singleton Socket.IO client for tablet real-time voting events.
class WebSocketService {
  static WebSocketService? _instance;

  /// Shared WebSocket service instance.
  static WebSocketService get instance => _instance ??= WebSocketService._();

  WebSocketService._();

  io.Socket? _socket;
  bool _isConnected = false;
  Timer? _reconnectTimer;

  String? _currentPautaId;
  BuildContext? _context;

  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 5;

  Timer? _errorDebounceTimer;
  String? _lastErrorMessage;

  final StreamController<Map<String, dynamic>> _votoNotificationController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _pautaStatusController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _statsUpdateController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _iniciarVotacaoController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _encerrarVotacaoController =
      StreamController<Map<String, dynamic>>.broadcast();
  final StreamController<Map<String, dynamic>> _novaPautaController =
      StreamController<Map<String, dynamic>>.broadcast();

  final StreamController<String> _connectionStatusController =
      StreamController<String>.broadcast();
  bool _isReconnecting = false;

  /// Vote notifications emitted by the backend for the current agenda room.
  Stream<Map<String, dynamic>> get votoNotifications =>
      _votoNotificationController.stream;

  /// Agenda status changes emitted by the backend.
  Stream<Map<String, dynamic>> get pautaStatusUpdates =>
      _pautaStatusController.stream;

  /// Live vote statistics updates.
  Stream<Map<String, dynamic>> get statsUpdates =>
      _statsUpdateController.stream;

  /// Events requesting the tablet to open a voting screen.
  Stream<Map<String, dynamic>> get iniciarVotacaoEvents =>
      _iniciarVotacaoController.stream;

  /// Events notifying that a voting session has ended.
  Stream<Map<String, dynamic>> get encerrarVotacaoEvents =>
      _encerrarVotacaoController.stream;

  /// Events notifying that a new agenda was registered.
  Stream<Map<String, dynamic>> get novaPautaEvents =>
      _novaPautaController.stream;

  /// Connection status values: `connected`, `disconnected`, or `reconnecting`.
  Stream<String> get connectionStatus => _connectionStatusController.stream;

  /// Whether the service is currently waiting for a reconnect attempt.
  bool get isReconnecting => _isReconnecting;

  /// Whether the socket is currently connected.
  bool get isConnected => _isConnected;

  /// Stores a UI context used for custom overlay toasts when available.
  void setContext(BuildContext context) {
    _context = context;
  }

  /// Opens the authenticated Socket.IO connection and registers event handlers.
  Future<void> connect() async {
    if (_socket != null && _isConnected) {
      print('🔌 WebSocket já está conectado');
      return;
    }

    try {
      final token = AuthService.token;
      if (token == null) {
        print('❌ Token de autenticação não encontrado');
        return;
      }

      print('🔌 Conectando ao WebSocket...');

      final uri = Uri.parse(AuthService.baseUrl);
      final hasPath = uri.path.isNotEmpty && uri.path != '/';

      // Proxied deployments connect to the origin and use a custom Socket.IO path.
      final String connectionUrl = hasPath ? uri.origin : AuthService.baseUrl;

      final Map<String, dynamic> socketOptions = {
        'transports': ['websocket', 'polling'],
        'auth': {'token': token},
        'timeout': 5000,
        'forceNew': true,
        'reconnection': true,
        'reconnectionDelay': 1000,
        'reconnectionDelayMax': 5000,
        'maxReconnectionAttempts': 20,
        'autoConnect': true,
        'forceNewConnection': true,
      };

      if (hasPath) {
        String pathPrefix = uri.path;
        if (pathPrefix.endsWith('/')) {
          pathPrefix = pathPrefix.substring(0, pathPrefix.length - 1);
        }
        socketOptions['path'] = '$pathPrefix/socket.io';
        print(
          '🔧 Configurando socket path via proxy: ${socketOptions['path']}',
        );
      }

      print('🔗 URL Base: $connectionUrl');

      _socket = io.io(connectionUrl, socketOptions);

      _setupEventHandlers();

      await _waitForConnection();
    } catch (e) {
      print('❌ Erro ao conectar WebSocket: $e');
      _scheduleReconnect();
    }
  }

  /// Waits until the socket connects or reports a connection failure.
  Future<void> _waitForConnection() async {
    final completer = Completer<void>();
    Timer? timeoutTimer;

    void onConnect() {
      timeoutTimer?.cancel();
      if (!completer.isCompleted) {
        completer.complete();
      }
    }

    void onError() {
      timeoutTimer?.cancel();
      if (!completer.isCompleted) {
        completer.completeError('Erro de conexão');
      }
    }

    _socket?.once('connect', (_) => onConnect());
    _socket?.once('connect_error', (_) => onError());

    timeoutTimer = Timer(const Duration(seconds: 3), () {
      if (!completer.isCompleted) {
        completer.completeError('Timeout na conexão');
      }
    });

    return completer.future;
  }

  /// Registers Socket.IO event handlers and forwards app events to streams.
  void _setupEventHandlers() {
    _socket?.on('connect', (_) {
      debugPrint('✅ Conectado ao WebSocket');
      _isConnected = true;
      _isReconnecting = false;
      _reconnectTimer?.cancel();
      _reconnectAttempts = 0;

      _connectionStatusController.add('connected');

      if (_currentPautaId != null) {
        joinPauta(_currentPautaId!);
      }
    });

    _socket?.on('disconnect', (_) {
      debugPrint('❌ Desconectado do WebSocket');
      _isConnected = false;

      _connectionStatusController.add('disconnected');

      _scheduleReconnect();
    });

    _socket?.on('connect_error', (error) {
      print('❌ Erro de conexão WebSocket: $error');
      _isConnected = false;
      _scheduleReconnect();
    });

    _socket?.on('connection-status', (data) {
      print('📡 Status de conexão: $data');
    });

    _socket?.on('voto-notification', (data) {
      print('🔔 Notificação de voto recebida: $data');
      _handleVotoNotification(data);
    });

    _socket?.on('pauta-stats-update', (data) {
      print('📊 Estatísticas atualizadas: $data');
      _statsUpdateController.add(Map<String, dynamic>.from(data));
    });

    _socket?.on('pauta-status-update', (data) {
      print('📢 Status da pauta atualizado: $data');
      _pautaStatusController.add(Map<String, dynamic>.from(data));
    });

    _socket?.on('pauta-status-notification', (data) {
      print('📢 Notificação de mudança de status: $data');
      _pautaStatusController.add(Map<String, dynamic>.from(data));
    });

    _socket?.on('vereador-connected', (data) {
      debugPrint('👤 Vereador conectado: ${data['nomeVereador']}');
    });

    _socket?.on('vereador-disconnected', (data) {
      debugPrint('👋 Vereador desconectado: ${data['nomeVereador']}');
    });

    _socket?.on('error', (error) {
      print('❌ Erro WebSocket: $error');
      _showErrorToast('Erro de conexão: ${error['message'] ?? error}');
    });

    _socket?.on('pauta-joined', (data) {
      print('📋 Entrou na pauta: $data');
    });

    _socket?.on('pauta-left', (data) {
      print('📋 Saiu da pauta: $data');
    });

    _socket?.on('iniciar-votacao', (data) {
      print('🗳️ Solicitação para iniciar votação recebida: $data');
      _handleIniciarVotacao(data);
    });

    _socket?.on('encerrar-votacao', (data) {
      print('🏁 Solicitação para encerrar votação recebida: $data');
      _handleEncerrarVotacao(data);
    });

    _socket?.on('nova-pauta', (data) {
      print('📝 Nova pauta cadastrada: $data');
      _handleNovaPauta(data);
    });
  }

  /// Publishes a vote notification and shows a toast for other council members' votes.
  void _handleVotoNotification(Map<String, dynamic> data) {
    _votoNotificationController.add(data);

    final currentUser = AuthService.currentUser;
    if (currentUser != null &&
        data['vereador'] != null &&
        data['pautaId'] != null &&
        _currentPautaId == data['pautaId'].toString()) {
      final vereadorVoto = data['vereador'];

      if (vereadorVoto['nome'] != currentUser['nome_parlamentar'] &&
          vereadorVoto['nome'] != currentUser['nome']) {
        final action = data['isUpdate'] == true
            ? 'alterou seu voto para'
            : 'votou';
        final message = '${vereadorVoto['nome']} $action ${data['voto']}';

        if (_context != null && _context!.mounted) {
          CustomToastService.showVoteToast(_context!, message, data['voto']);
        } else {
          _showVoteToast(message, data['voto']);
        }
      }
    }
  }

  /// Publishes a vote-start event and notifies the user.
  void _handleIniciarVotacao(Map<String, dynamic> data) {
    print('🗳️ Processando solicitação de iniciar votação: $data');

    _iniciarVotacaoController.add(data);

    final pautaNome = data['pautaNome'] ?? 'Pauta sem nome';
    final message = 'Iniciando votação: $pautaNome';

    if (_context != null && _context!.mounted) {
      CustomToastService.showInfoToast(_context!, message);
    } else {
      _showInfoToast(message);
    }
  }

  /// Publishes a vote-closing event and notifies the user.
  void _handleEncerrarVotacao(Map<String, dynamic> data) {
    print('🏁 Processando solicitação de encerrar votação: $data');

    _encerrarVotacaoController.add(data);

    final pautaNome = data['pautaNome'] ?? 'Pauta sem nome';
    final resultado = data['resultado'] ?? 'Finalizada';
    final message = 'Votação encerrada: $pautaNome - $resultado';

    if (_context != null && _context!.mounted) {
      CustomToastService.showInfoToast(_context!, message);
    } else {
      _showInfoToast(message);
    }
  }

  /// Publishes a new-agenda event and notifies the user.
  void _handleNovaPauta(Map<String, dynamic> data) {
    print('📝 Processando notificação de nova pauta: $data');

    _novaPautaController.add(data);

    final pautaNome = data['pautaNome'] ?? 'Nova pauta';
    final message = 'Nova pauta cadastrada: $pautaNome';

    if (_context != null && _context!.mounted) {
      CustomToastService.showInfoToast(_context!, message);
    } else {
      _showInfoToast(message);
    }
  }

  /// Joins an agenda room, or stores it to join after reconnecting.
  void joinPauta(String pautaId) {
    if (_socket != null && _isConnected) {
      print('📋 Entrando na pauta: $pautaId');
      _socket!.emit('join-pauta', pautaId);
      _currentPautaId = pautaId;
    } else {
      print('⚠️ WebSocket não conectado. Salvando pauta para entrar depois.');
      _currentPautaId = pautaId;
    }
  }

  /// Leaves an agenda room and clears the current agenda context.
  void leavePauta(String pautaId) {
    if (_socket != null && _isConnected) {
      print('📋 Saindo da pauta: $pautaId');
      _socket!.emit('leave-pauta', pautaId);
    }
    _currentPautaId = null;
  }

  /// Requests live statistics for an agenda from the backend.
  void requestStats(String pautaId) {
    if (_socket != null && _isConnected) {
      _socket!.emit('request-stats', pautaId);
    }
  }

  /// Sends a ping event when the socket is connected.
  void ping() {
    if (_socket != null && _isConnected) {
      _socket!.emit('ping');
    }
  }

  /// Schedules a reconnect attempt with exponential backoff and attempt limits.
  void _scheduleReconnect() {
    _reconnectTimer?.cancel();

    if (_reconnectAttempts >= _maxReconnectAttempts) {
      debugPrint(
        '🛑 Máximo de tentativas de reconexão atingido ($_maxReconnectAttempts)',
      );
      _isReconnecting = false;
      _connectionStatusController.add('disconnected');
      return;
    }

    _isReconnecting = true;
    _connectionStatusController.add('reconnecting');

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s.
    final delaySeconds = (1 << _reconnectAttempts).clamp(1, 16);
    _reconnectAttempts++;

    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
      if (!_isConnected) {
        debugPrint(
          '🔄 Tentativa de reconexão $_reconnectAttempts/$_maxReconnectAttempts (delay: ${delaySeconds}s)',
        );
        connect();
      }
    });
  }

  /// Shows a vote toast through the Fluttertoast fallback path.
  void _showVoteToast(String message, String voto) {
    Color backgroundColor;
    IconData icon;

    switch (voto) {
      case 'SIM':
        backgroundColor = const Color(0xFF2EA043);
        icon = Icons.thumb_up;
        break;
      case 'NÃO':
        backgroundColor = const Color(0xFFDA3633);
        icon = Icons.thumb_down;
        break;
      case 'ABSTENÇÃO':
        backgroundColor = const Color(0xFFF08833);
        icon = Icons.remove_circle_outline;
        break;
      default:
        backgroundColor = const Color(0xFF58a6ff);
        icon = Icons.info;
    }

    _showCustomToastOverlay(message, backgroundColor, icon);
  }

  /// Shows a top-positioned Fluttertoast with a solid web background color.
  void _showCustomToastOverlay(
    String message,
    Color backgroundColor,
    IconData icon,
  ) {
    Fluttertoast.showToast(
      msg: message,
      toastLength: Toast.LENGTH_SHORT,
      gravity: ToastGravity.TOP,
      timeInSecForIosWeb: 3,
      backgroundColor: backgroundColor,
      textColor: Colors.white,
      fontSize: 14.0,
      webBgColor:
          '#${backgroundColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}',
      webPosition: "top",
      webShowClose: false,
    );
  }

  /// Shows a debounced error toast to avoid repeated identical messages.
  void _showErrorToast(String message) {
    if (message == _lastErrorMessage && _errorDebounceTimer?.isActive == true) {
      return;
    }

    _lastErrorMessage = message;
    _errorDebounceTimer?.cancel();
    _errorDebounceTimer = Timer(const Duration(seconds: 5), () {
      _lastErrorMessage = null;
    });

    Fluttertoast.showToast(
      msg: message,
      toastLength: Toast.LENGTH_LONG,
      gravity: ToastGravity.CENTER,
      timeInSecForIosWeb: 4,
      backgroundColor: const Color(0xFFDA3633),
      textColor: Colors.white,
      fontSize: 14.0,
    );
  }

  /// Shows a default informational toast.
  void _showInfoToast(String message) {
    Fluttertoast.showToast(
      msg: message,
      toastLength: Toast.LENGTH_SHORT,
      gravity: ToastGravity.CENTER,
      timeInSecForIosWeb: 3,
      backgroundColor: const Color(0xFF58a6ff),
      textColor: Colors.white,
      fontSize: 14.0,
    );
  }

  /// Shows a customizable Fluttertoast message.
  void showCustomToast(
    String message, {
    Color? backgroundColor,
    ToastGravity gravity = ToastGravity.BOTTOM,
    int duration = 3,
  }) {
    Fluttertoast.showToast(
      msg: message,
      toastLength: Toast.LENGTH_SHORT,
      gravity: gravity,
      timeInSecForIosWeb: duration,
      backgroundColor:
          backgroundColor ?? const Color(0xFF58a6ff),
      textColor: Colors.white,
      fontSize: 14.0,
    );
  }

  /// Disconnects the socket, leaves the active agenda room, and resets connection state.
  void disconnect() {
    print('🔌 Desconectando WebSocket...');

    _reconnectTimer?.cancel();

    if (_currentPautaId != null) {
      leavePauta(_currentPautaId!);
    }

    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
    _currentPautaId = null;
  }

  /// Releases socket resources and closes all broadcast stream controllers.
  void dispose() {
    disconnect();
    _votoNotificationController.close();
    _pautaStatusController.close();
    _statsUpdateController.close();
    _iniciarVotacaoController.close();
    _encerrarVotacaoController.close();
    _novaPautaController.close();
    _connectionStatusController.close();
  }

  /// Ensures a socket connection exists before callers rely on live events.
  Future<void> ensureConnection() async {
    if (!_isConnected) {
      await connect();
    }
  }

  /// Returns connection diagnostics for debugging.
  Map<String, dynamic> getDebugInfo() {
    return {
      'isConnected': _isConnected,
      'socketId': _socket?.id,
      'currentPauta': _currentPautaId,
      'hasReconnectTimer': _reconnectTimer?.isActive ?? false,
    };
  }
}
