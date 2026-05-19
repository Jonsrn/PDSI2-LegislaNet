import 'dart:async';
import 'package:flutter/material.dart';

/// Stub WebSocket service that preserves the production service API.
///
/// This implementation emits no socket-driven domain events so the app can
/// continue operating through HTTP polling until the Socket.IO integration is
/// implemented.
class WebSocketService {
  /// Shared singleton instance.
  static final WebSocketService _instance = WebSocketService._internal();

  /// Creates the internal singleton instance.
  WebSocketService._internal();

  /// Returns the shared WebSocket service instance.
  static WebSocketService get instance => _instance;

  /// Whether the stub currently reports an active connection.
  bool _connected = false;

  /// Whether the service is currently connected.
  bool get isConnected => _connected;

  /// Controller for agenda status updates.
  final _pautaStatusController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Controller for voting-start events.
  final _iniciarVotacaoController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Controller for voting-finished events.
  final _encerrarVotacaoController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Controller for newly created agenda events.
  final _novaPautaController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Controller for connection status changes.
  final _connectionController = StreamController<String>.broadcast();

  /// Controller for vote notification events.
  final _votoNotificationsController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Controller for live statistics updates.
  final _statsUpdatesController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of agenda status updates.
  Stream<Map<String, dynamic>> get pautaStatusUpdates =>
      _pautaStatusController.stream;

  /// Stream of voting-start events.
  Stream<Map<String, dynamic>> get iniciarVotacaoEvents =>
      _iniciarVotacaoController.stream;

  /// Stream of voting-finished events.
  Stream<Map<String, dynamic>> get encerrarVotacaoEvents =>
      _encerrarVotacaoController.stream;

  /// Stream of newly created agenda events.
  Stream<Map<String, dynamic>> get novaPautaEvents =>
      _novaPautaController.stream;

  /// Stream of connection status values.
  Stream<String> get connectionStatus => _connectionController.stream;

  /// Stream of vote notification events.
  Stream<Map<String, dynamic>> get votoNotifications =>
      _votoNotificationsController.stream;

  /// Stream of live statistics updates.
  Stream<Map<String, dynamic>> get statsUpdates =>
      _statsUpdatesController.stream;

  /// Marks the stub as connected so the app can continue through HTTP polling.
  Future<void> connect() async {
    print('[WebSocketService] STUB — operando via HTTP polling.');
    _connected = true;
    _connectionController.add('connected');
  }

  /// Marks the stub as disconnected.
  void disconnect() {
    _connected = false;
  }

  /// Accepts a [context] for API compatibility with the real implementation.
  void setContext(BuildContext context) {
  }

  /// Keeps the agenda-room API available until Socket.IO support is added.
  void joinPauta(String pautaId) {
    print('[WebSocketService] STUB — joinPauta($pautaId) sem efeito.');
  }

  /// Keeps the agenda-room leave API available until Socket.IO support is added.
  void leavePauta(String pautaId) {
    print('[WebSocketService] STUB — leavePauta($pautaId) sem efeito.');
  }

  /// Closes all stream controllers owned by this service.
  void dispose() {
    _pautaStatusController.close();
    _iniciarVotacaoController.close();
    _encerrarVotacaoController.close();
    _novaPautaController.close();
    _connectionController.close();
    _votoNotificationsController.close();
    _statsUpdatesController.close();
  }
}
