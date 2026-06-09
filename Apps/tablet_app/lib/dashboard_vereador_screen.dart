import 'package:flutter/material.dart';
import 'votacao_pauta_screen.dart';
import 'services/auth_service.dart';
import 'services/websocket_service.dart';
import 'dart:async';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// Vote options shown for the council member on agenda cards.
enum VotoTipo { sim, nao, abstencao, naoVotado }

/// Dashboard tabs grouped by agenda voting state.
enum TabState { pendente, emVotacao, finalizada }

/// Dashboard used by council members to follow agendas and join live votes.
class DashboardVereadorScreen extends StatefulWidget {
  /// Creates the council member dashboard screen.
  const DashboardVereadorScreen({super.key});

  @override
  State<DashboardVereadorScreen> createState() =>
      _DashboardVereadorScreenState();
}

/// Manages agenda loading, live voting events, and dashboard presentation.
class _DashboardVereadorScreenState extends State<DashboardVereadorScreen> {
  TabState _currentTab = TabState.pendente;
  String _connectionStatus = 'connected';
  Map<String, dynamic>? _vereadorData;
  bool _isLoadingVereador = true;
  List<Map<String, dynamic>> _pautasPendentes = [];
  List<Map<String, dynamic>> _pautasEmVotacao = [];
  List<Map<String, dynamic>> _pautasFinalizadas = [];
  bool _isLoadingPautas = true;
  bool _isLoadingMorePautas = false;
  int _pautasPage = 1;
  int _pautasTotalPages = 1;
  final Map<String, Map<String, dynamic>> _pautasById = {};
  final Map<String, Map<String, dynamic>> _votosVereador = {};

  final WebSocketService _webSocketService = WebSocketService.instance;
  StreamSubscription<Map<String, dynamic>>? _pautaStatusSubscription;
  StreamSubscription<Map<String, dynamic>>? _iniciarVotacaoSubscription;
  StreamSubscription<Map<String, dynamic>>? _encerrarVotacaoSubscription;
  StreamSubscription<Map<String, dynamic>>? _novaPautaSubscription;
  StreamSubscription<String>? _connectionSubscription;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable();
    _loadVereadorData();
    _loadPautas();
    _connectWebSocket();
    _setupWebSocketListeners();
  }

  /// Connects to the shared WebSocket service used for live dashboard updates.
  Future<void> _connectWebSocket() async {
    try {
      await _webSocketService.connect();
      print('✅ WebSocket conectado com sucesso no dashboard');
    } catch (e) {
      print('❌ Erro ao conectar WebSocket no dashboard: $e');
    }
  }

  @override
  void dispose() {
    _pautaStatusSubscription?.cancel();
    _iniciarVotacaoSubscription?.cancel();
    _encerrarVotacaoSubscription?.cancel();
    _novaPautaSubscription?.cancel();
    _connectionSubscription?.cancel();
    super.dispose();
  }

  /// Subscribes to WebSocket events that keep agenda lists and connection state current.
  void _setupWebSocketListeners() {
    _pautaStatusSubscription = _webSocketService.pautaStatusUpdates.listen((
      data,
    ) async {
      print('📢 Notificação de mudança de status recebida: $data');
      await _handlePautaStatusChange(data);
    });

    _iniciarVotacaoSubscription = _webSocketService.iniciarVotacaoEvents.listen(
      (data) {
        print('🗳️ Evento de iniciar votação recebido: $data');
        _handleIniciarVotacao(data);
      },
    );

    _encerrarVotacaoSubscription = _webSocketService.encerrarVotacaoEvents
        .listen((data) async {
          print('🏁 Evento de encerrar votação recebido: $data');
          await _handleEncerrarVotacao(data);
        });

    _novaPautaSubscription = _webSocketService.novaPautaEvents.listen((
      data,
    ) async {
      print('📝 Evento de nova pauta recebido: $data');
      await _handleNovaPauta(data);
    });

    _connectionSubscription = _webSocketService.connectionStatus.listen((
      status,
    ) {
      if (mounted) {
        setState(() {
          _connectionStatus = status;
        });
      }
    });

    _connectionStatus = _webSocketService.isConnected
        ? 'connected'
        : 'disconnected';
  }

  /// Handles a status-change notification and updates the local agenda cache.
  Future<void> _handlePautaStatusChange(Map<String, dynamic> data) async {
    final pautaId = data['pautaId']?.toString();
    final newStatus = data['newStatus']?.toString();

    if (pautaId == null || newStatus == null) {
      print('⚠️ Dados incompletos na notificação de status: $data');
      return;
    }

    print('🔄 Processando mudança de status: Pauta $pautaId → $newStatus');

    await _applyStatusUpdateToCache(pautaId, newStatus, data);
  }

  /// Applies a live status change to the agenda cache and refreshes derived lists.
  ///
  /// If the agenda is not already cached, it is fetched by ID so WebSocket events
  /// still work when the agenda is outside the currently loaded page.
  Future<void> _applyStatusUpdateToCache(
    String pautaId,
    String newStatus,
    Map<String, dynamic> statusData,
  ) async {
    final normalizedStatus = _normalizeStatus(newStatus);

    if (!_pautasById.containsKey(pautaId)) {
      final pautaById = await AuthService.getPautaById(pautaId);
      if (pautaById != null && pautaById.isNotEmpty) {
        _pautasById[pautaId] = Map<String, dynamic>.from(pautaById);
      } else {
        _pautasById[pautaId] = {'id': pautaId};
      }
    }

    final pauta = Map<String, dynamic>.from(
      _pautasById[pautaId] ?? {'id': pautaId},
    );
    pauta['id'] = pautaId;
    pauta['status'] = normalizedStatus;

    if (normalizedStatus.toLowerCase() == 'em votação') {
      pauta['ao_vivo'] = true;
    } else if (normalizedStatus.toLowerCase() == 'finalizada') {
      pauta['ao_vivo'] = false;
      if (statusData['resultado'] != null) {
        pauta['resultado_votacao'] = statusData['resultado'];
      }
    } else {
      pauta['ao_vivo'] = false;
    }

    _pautasById[pautaId] = pauta;
    _recomputePautasFromCache();

    if (normalizedStatus.toLowerCase() == 'finalizada') {
      await _loadVotosVereadorForPauta(pautaId);
    }
  }

  /// Normalizes backend and WebSocket status labels into dashboard display values.
  String _normalizeStatus(String status) {
    final s = status.trim().toLowerCase();
    if (s == 'em votacao' || s == 'em votação') return 'Em Votação';
    if (s == 'pendente') return 'Pendente';
    if (s == 'finalizada') return 'Finalizada';
    return status;
  }

  /// Handles a vote-closing event and marks the agenda as finalized locally.
  Future<void> _handleEncerrarVotacao(Map<String, dynamic> data) async {
    final pautaId = data['pautaId']?.toString() ?? data['id']?.toString();
    if (pautaId == null || pautaId.isEmpty) {
      print('⚠️ Evento de encerrar votação sem pautaId: $data');
      return;
    }
    await _applyStatusUpdateToCache(pautaId, 'Finalizada', data);
  }

  /// Handles a newly created agenda event and inserts it into the pending tab.
  Future<void> _handleNovaPauta(Map<String, dynamic> data) async {
    final pautaId = data['pautaId']?.toString() ?? data['id']?.toString();
    if (pautaId == null || pautaId.isEmpty) {
      print('⚠️ Evento de nova pauta sem pautaId: $data');
      return;
    }

    // Fetch by ID because the event payload may omit fields used by agenda cards.
    final pautaById = await AuthService.getPautaById(pautaId);
    if (pautaById != null && pautaById.isNotEmpty) {
      final pauta = Map<String, dynamic>.from(pautaById);
      pauta['id'] ??= pautaId;
      pauta['status'] ??= 'Pendente';
      pauta['ao_vivo'] ??= false;
      _pautasById[pautaId] = pauta;
      _recomputePautasFromCache();
    } else {
      _pautasById[pautaId] = {
        'id': pautaId,
        'status': 'Pendente',
        'ao_vivo': false,
        'nome': data['pautaNome'] ?? 'Nova pauta',
      };
      _recomputePautasFromCache();
    }

    if (mounted) {
      setState(() {
        _currentTab = TabState.pendente;
      });
    }
  }

  /// Handles a live-vote start event and opens the voting screen when possible.
  Future<void> _handleIniciarVotacao(Map<String, dynamic> data) async {
    final pautaId = data['pautaId']?.toString();
    final pautaNome = data['pautaNome']?.toString() ?? 'Pauta';

    if (pautaId == null) {
      print('⚠️ Evento de iniciar votação sem pautaId: $data');
      return;
    }

    print(
      '🗳️ Processando solicitação de iniciar votação: $pautaNome (ID: $pautaId)',
    );

    // Fetch directly by ID to avoid depending on the currently loaded page.
    final pautaById = await AuthService.getPautaById(pautaId);
    if (pautaById == null || pautaById.isEmpty) {
      print('❌ Pauta $pautaId não encontrada via API por ID');

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Aguarde! Carregando votação: $pautaNome'),
          backgroundColor: const Color(0xFF58a6ff),
          duration: const Duration(seconds: 2),
        ),
      );
      return;
    }

    final pauta = Map<String, dynamic>.from(pautaById);

    // Keep the live agenda visible even if automatic navigation cannot open.
    _upsertPautaFromIniciarVotacao(pautaId, pauta);

    if (!mounted) return;

    bool opened = false;
    dynamic result;
    try {
      opened = true;
      result = await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => VotacaoPautaScreen(pauta: pauta),
        ),
      );
    } catch (e) {
      opened = false;
      print('❌ Falha ao abrir tela de votação automaticamente: $e');
    }

    // Provide a manual fallback if automatic navigation fails.
    if (mounted && !opened) {
      setState(() {
        _currentTab = TabState.emVotacao;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Votação iniciada: $pautaNome'),
          backgroundColor: const Color(0xFF58a6ff),
          action: SnackBarAction(
            label: 'Abrir',
            textColor: Colors.white,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => VotacaoPautaScreen(pauta: pauta),
                ),
              );
            },
          ),
          duration: const Duration(seconds: 6),
        ),
      );
      return;
    }

    if (opened) {
      // Refresh votes after returning, including manual backs where result is null.
      await _loadVotosVereador();
      if (result == true) {
        await _loadPautas();
      }
      if (mounted) setState(() {});
    }

    print('✅ Navegado para tela de votação da pauta: $pautaNome');
  }

  /// Inserts or updates an agenda from a vote-start event before rebuilding tab lists.
  void _upsertPautaFromIniciarVotacao(
    String pautaId,
    Map<String, dynamic> pauta,
  ) {
    if (pauta['id'] == null) {
      pauta['id'] = pautaId;
    }
    if ((pauta['status']?.toString().isEmpty ?? true)) {
      pauta['status'] = 'Em Votação';
    }
    // Missing `ao_vivo` should not hide an agenda that just entered voting.
    if (!pauta.containsKey('ao_vivo')) {
      pauta['ao_vivo'] = true;
    }

    _pautasById[pautaId] = Map<String, dynamic>.from(pauta);
    _recomputePautasFromCache();
  }

  /// Rebuilds tab-specific agenda lists from the normalized in-memory cache.
  void _recomputePautasFromCache() {
    if (!mounted) return;

    final all = _pautasById.values.toList();
    all.sort((a, b) {
      final aCreated = a['created_at']?.toString() ?? '';
      final bCreated = b['created_at']?.toString() ?? '';
      return bCreated.compareTo(aCreated);
    });

    setState(() {
      _pautasPendentes = all
          .where((pauta) => pauta['status']?.toLowerCase() == 'pendente')
          .toList();

      _pautasEmVotacao = all.where((pauta) {
        final isEmVotacao = pauta['status']?.toLowerCase() == 'em votação';
        if (!isEmVotacao) return false;

        // Only show live agendas explicitly confirmed by the `ao_vivo` flag.
        if (!pauta.containsKey('ao_vivo')) return false;
        return pauta['ao_vivo'] == true;
      }).toList();

      _pautasFinalizadas = all
          .where((pauta) => pauta['status']?.toLowerCase() == 'finalizada')
          .toList();
    });
  }

  /// Loads the council member vote and final statistics for one finalized agenda.
  Future<void> _loadVotosVereadorForPauta(String pautaId) async {
    try {
      print('🗳️ Carregando estatísticas da pauta finalizada: $pautaId');

      final estatisticas = await AuthService.getEstatisticasPauta(pautaId);
      if (estatisticas != null) {
        final votosResponse = await AuthService.getVotosVereador();
        if (votosResponse != null) {
          final votosPorPauta =
              votosResponse['votosPorPauta'] as Map<String, dynamic>? ?? {};
          final votoVereador = votosPorPauta[pautaId];

          setState(() {
            _votosVereador[pautaId] = {
              'voto': votoVereador?['voto'],
              'estatisticas': estatisticas['estatisticas'],
              'resultado': estatisticas['pauta']?['resultado_votacao'],
            };
          });

          print('✅ Estatísticas carregadas para pauta $pautaId');
        }
      }
    } catch (e) {
      print('❌ Erro ao carregar estatísticas da pauta $pautaId: $e');
    }
  }

  /// Loads the current council member profile data displayed in the header.
  Future<void> _loadVereadorData() async {
    try {
      final vereadorData = await AuthService.getVereadorDetails();
      if (mounted) {
        setState(() {
          _vereadorData = vereadorData;
          _isLoadingVereador = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoadingVereador = false;
        });
      }
    }
  }

  /// Loads the first agenda page and synchronizes live-voting state with the backend.
  Future<void> _loadPautas() async {
    try {
      setState(() {
        _isLoadingPautas = true;
      });

      print('🔗 Carregando pautas (page=1) via backend tablet...');

      _pautasById.clear();
      _pautasPage = 1;
      _pautasTotalPages = 1;

      final response = await AuthService.getPautas(page: 1, limit: 50);
      if (response == null || response['data'] == null) {
        print('❌ Erro ao carregar pautas (page=1)');
        if (mounted) {
          setState(() {
            _isLoadingPautas = false;
          });
        }
        return;
      }

      final pagination = response['pagination'];
      if (pagination != null) {
        _pautasTotalPages = pagination['totalPages'] ?? 1;
      }

      _ingestPautasResponse(response);

      // Treat live-voting status as the source of truth for stale `ao_vivo` flags.
      if (_vereadorData != null && _vereadorData!['camara_id'] != null) {
        final camaraId = _vereadorData!['camara_id'].toString();
        final liveStatus = await AuthService.getLiveVotingStatus(camaraId);
        final Set<String> activeIds = {};

        if (liveStatus != null &&
            liveStatus['isLive'] == true &&
            liveStatus['votacoes'] != null) {
          final votacoes = liveStatus['votacoes'] as List;
          for (final v in votacoes) {
            final activeId = v['pautaId']?.toString();
            if (activeId != null) activeIds.add(activeId);
          }
        }

        for (final pauta in _pautasById.values) {
          if (pauta['status'] == 'Em Votação') {
            final id = pauta['id']?.toString();
            final shouldBeLive = activeIds.contains(id);

            if (pauta['ao_vivo'] != shouldBeLive) {
              print('🧹 Sanitizando pauta $id: ao_vivo = $shouldBeLive');
              pauta['ao_vivo'] = shouldBeLive;
            }
          }
        }
        _recomputePautasFromCache();
      }

      if (mounted) {
        setState(() {
          _isLoadingPautas = false;
        });

        print('✅ Pautas organizadas (page=1):');
        print('   - Pendentes: ${_pautasPendentes.length}');
        print('   - Em Votação: ${_pautasEmVotacao.length}');
        print('   - Finalizadas: ${_pautasFinalizadas.length}');
        print(
          '   - Pagination: page=$_pautasPage / totalPages=$_pautasTotalPages',
        );

        await _loadVotosVereador();
      }
    } catch (e) {
      print('💥 Erro ao carregar pautas: $e');
      if (mounted) {
        setState(() {
          _isLoadingPautas = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao carregar pautas: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Merges a paginated agenda response into the cache and rebuilds tab lists.
  void _ingestPautasResponse(Map<String, dynamic> response) {
    final pautasData = response['data'];
    if (pautasData == null) return;

    final List<Map<String, dynamic>> pageItems = [];
    if (pautasData['pendentes'] != null) {
      pageItems.addAll(
        List<Map<String, dynamic>>.from(pautasData['pendentes']),
      );
    }
    if (pautasData['emVotacao'] != null) {
      pageItems.addAll(
        List<Map<String, dynamic>>.from(pautasData['emVotacao']),
      );
    }
    if (pautasData['finalizadas'] != null) {
      pageItems.addAll(
        List<Map<String, dynamic>>.from(pautasData['finalizadas']),
      );
    }

    for (final pauta in pageItems) {
      final id = pauta['id']?.toString();
      if (id == null || id.isEmpty) continue;
      _pautasById[id] = Map<String, dynamic>.from(pauta);
    }

    _recomputePautasFromCache();
  }

  /// Loads the next agenda page when available and appends it to the cache.
  Future<void> _loadMorePautas() async {
    if (_isLoadingPautas || _isLoadingMorePautas) return;
    if (_pautasPage >= _pautasTotalPages) return;

    try {
      if (mounted) {
        setState(() {
          _isLoadingMorePautas = true;
        });
      }

      final nextPage = _pautasPage + 1;
      print('📡 Carregando mais pautas (page=$nextPage)...');

      final response = await AuthService.getPautas(page: nextPage, limit: 50);
      if (response == null || response['data'] == null) {
        print('❌ Erro ao carregar pautas da página $nextPage');
        return;
      }

      _pautasPage = nextPage;
      final pagination = response['pagination'];
      if (pagination != null) {
        _pautasTotalPages = pagination['totalPages'] ?? _pautasTotalPages;
      }

      _ingestPautasResponse(response);
    } catch (e) {
      print('💥 Erro ao carregar mais pautas: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingMorePautas = false;
        });
      }
    }
  }

  /// Triggers lazy pagination when the current list is close to the bottom.
  bool _onScrollNotification(ScrollNotification notification) {
    if (notification.metrics.extentAfter < 300) {
      _loadMorePautas();
    }
    return false;
  }

  /// Loads the current council member's votes and statistics for visible agendas.
  Future<void> _loadVotosVereador() async {
    try {
      print('🗳️ Carregando votos do vereador via backend tablet...');

      final votosResponse = await AuthService.getVotosVereador();

      if (votosResponse != null) {
        final votosPorPauta =
            votosResponse['votosPorPauta'] as Map<String, dynamic>? ?? {};

        final pautasFinalizadasIds = _pautasFinalizadas
            .map((p) => p['id'])
            .where((id) => id != null)
            .toList();

        for (final pautaId in pautasFinalizadasIds) {
          try {
            final estatisticas = await AuthService.getEstatisticasPauta(
              pautaId,
            );
            if (estatisticas != null) {
              final votoVereador = votosPorPauta[pautaId];

              setState(() {
                _votosVereador[pautaId] = {
                  'voto': votoVereador?['voto'],
                  'estatisticas': estatisticas['estatisticas'],
                  'resultado': estatisticas['pauta']?['resultado_votacao'],
                };
              });
            }
          } catch (e) {
            print('Erro ao carregar estatísticas da pauta $pautaId: $e');
          }
        }

        final pautasEmVotacaoIds = _pautasEmVotacao
            .map((p) => p['id'])
            .where((id) => id != null)
            .toList();
        for (final pautaId in pautasEmVotacaoIds) {
          final votoVereador = votosPorPauta[pautaId];
          if (votoVereador != null) {
            setState(() {
              _votosVereador[pautaId] = {'voto': votoVereador['voto']};
            });
          }
        }

        print(
          '✅ Votos do vereador carregados: ${_votosVereador.length} pautas com voto',
        );
      }
    } catch (e) {
      print('💥 Erro ao carregar votos do vereador: $e');
    }
  }

  /// Opens an agenda PDF in an external application when an attachment URL exists.
  Future<void> _openPautaPDF(String? anexoUrl) async {
    if (anexoUrl == null || anexoUrl.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Esta pauta não possui arquivo PDF anexado'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    try {
      String finalUrl = anexoUrl;
      if (!anexoUrl.startsWith('http')) {
        if (anexoUrl.startsWith('/')) {
          finalUrl = anexoUrl.substring(1);
        }
        // Uploaded files are served from the main site root, not the tablet API path.
        finalUrl = 'https://legislanet.com.br/$finalUrl';
      }

      print('📄 Abrindo PDF: $finalUrl');
      final uri = Uri.parse(finalUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        throw 'Não foi possível abrir o PDF';
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao abrir PDF: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  /// Handles agenda card taps according to the agenda status.
  void _handlePautaTap(Map<String, dynamic> pauta, String status) async {
    if (status.toLowerCase() == 'pendente') {
      _openPautaPDF(pauta['anexo_url']);
    } else if (status.toLowerCase() == 'em votação') {
      final result = await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => VotacaoPautaScreen(pauta: pauta),
        ),
      );

      // Apply confirmed vote data immediately before the follow-up refresh completes.
      if (result is Map &&
          result['votoRegistrado'] == true &&
          result['voto'] != null) {
        print('✅ UI Otimista: Aplicando voto ${result['voto']} imediatamente.');
        _votosVereador[pauta['id'].toString()] = {
          'voto': result['voto'],
          'pauta_id': pauta['id'],
          'created_at': DateTime.now().toIso8601String(),
        };
        if (mounted) setState(() {});
      }

      await _loadVotosVereador();

      if (result == true ||
          (result is Map && result['votoRegistrado'] == true)) {
        await _loadPautas();
      }

      if (mounted) setState(() {});
    }
  }

  /// Resolves the cached vote data for an agenda into a display enum value.
  VotoTipo _getVotoFromData(String? pautaId) {
    if (pautaId == null) return VotoTipo.naoVotado;

    final votoData = _votosVereador[pautaId];
    if (votoData == null) return VotoTipo.naoVotado;

    switch (votoData['voto']) {
      case 'SIM':
        return VotoTipo.sim;
      case 'NÃO':
        return VotoTipo.nao;
      case 'ABSTENÇÃO':
        return VotoTipo.abstencao;
      default:
        return VotoTipo.naoVotado;
    }
  }

  /// Returns the final agenda status label derived from voting results.
  String _getStatusFromResult(Map<String, dynamic> pauta) {
    final resultado = pauta['resultado_votacao'];
    if (resultado == null) return 'Finalizada';

    switch (resultado) {
      case 'Aprovada':
        return 'Aprovada';
      case 'Reprovada':
        return 'Reprovada';
      default:
        return 'Finalizada';
    }
  }

  /// Returns the visual status color for finalized agenda results.
  Color _getStatusColor(Map<String, dynamic> pauta) {
    final resultado = pauta['resultado_votacao'];

    switch (resultado) {
      case 'Aprovada':
        return const Color(0xFF2EA043);
      case 'Reprovada':
        return const Color(0xFFDA3633);
      case 'Abstenção':
      case 'Empate':
        return const Color(0xFFF08833);
      default:
        return const Color(0xFF6e7681);
    }
  }

  /// Returns the connection badge color for the current WebSocket state.
  Color _getConnectionColor() {
    switch (_connectionStatus) {
      case 'connected':
        return const Color(0xFF2EA043);
      case 'reconnecting':
        return const Color(0xFFF08833);
      case 'disconnected':
      default:
        return const Color(0xFFDA3633);
    }
  }

  /// Returns the connection badge icon for the current WebSocket state.
  IconData _getConnectionIcon() {
    switch (_connectionStatus) {
      case 'connected':
        return Icons.flash_on;
      case 'reconnecting':
        return Icons.sync;
      case 'disconnected':
      default:
        return Icons.wifi_off;
    }
  }

  /// Returns the localized connection badge label for the current WebSocket state.
  String _getConnectionText() {
    switch (_connectionStatus) {
      case 'connected':
        return 'Conectado';
      case 'reconnecting':
        return 'Reconectando...';
      case 'disconnected':
      default:
        return 'Desconectado';
    }
  }

  /// Logs out and returns the app to the initial route.
  Future<void> _handleLogout() async {
    await AuthService.logout();
    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/', (route) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0d1117),
          gradient: LinearGradient(
            begin: Alignment(-0.7071, -0.7071),
            end: Alignment(0.7071, 0.7071),
            colors: [
              Color.fromRGBO(88, 166, 255, 0.08),
              Color.fromRGBO(46, 160, 67, 0.06),
              Color.fromRGBO(138, 58, 185, 0.05),
              Color.fromRGBO(240, 136, 51, 0.07),
              Color.fromRGBO(88, 166, 255, 0.04),
            ],
            stops: [0.0, 0.25, 0.5, 0.75, 1.0],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              left: MediaQuery.of(context).size.width * 0.2 - 200,
              top: MediaQuery.of(context).size.height * 0.3 - 200,
              child: Container(
                width: 400,
                height: 400,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center,
                    radius: 0.6,
                    colors: [
                      const Color.fromRGBO(46, 160, 67, 0.05),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.6],
                  ),
                ),
              ),
            ),
            Positioned(
              left: MediaQuery.of(context).size.width * 0.8 - 200,
              top: MediaQuery.of(context).size.height * 0.7 - 200,
              child: Container(
                width: 400,
                height: 400,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center,
                    radius: 0.6,
                    colors: [
                      const Color.fromRGBO(138, 58, 185, 0.04),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.6],
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Column(
                children: [
                  _buildHeader(),
                  const SizedBox(height: 24),
                  _buildTabButtons(),
                  const SizedBox(height: 24),
                  _buildCurrentView(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Builds the profile header with council member data and connection status.
  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16.0),
      margin: const EdgeInsets.symmetric(horizontal: 16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 35,
            backgroundColor: Colors.grey[600],
            child: _isLoadingVereador
                ? const CircularProgressIndicator(
                    color: Colors.white,
                    strokeWidth: 2,
                  )
                : _vereadorData?['foto_url'] != null &&
                      _vereadorData!['foto_url'].isNotEmpty
                ? ClipOval(
                    child: Image.network(
                      _vereadorData!['foto_url'],
                      width: 70,
                      height: 70,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) {
                        return const Icon(
                          Icons.person,
                          size: 40,
                          color: Colors.white,
                        );
                      },
                    ),
                  )
                : const Icon(Icons.person, size: 40, color: Colors.white),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Boa tarde Vereador,',
                  style: TextStyle(fontSize: 16, color: Colors.white70),
                ),
                Text(
                  _vereadorData?['nome_parlamentar'] ??
                      AuthService.currentUser?['nome'] ??
                      'Carregando...',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Câmara municipal, ${DateTime.now().day}/${DateTime.now().month}/${DateTime.now().year}',
                  style: const TextStyle(fontSize: 12, color: Colors.white60),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(
              color: _getConnectionColor(),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(_getConnectionIcon(), color: Colors.white, size: 16),
                const SizedBox(width: 6),
                Text(
                  _getConnectionText(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: _handleLogout,
            icon: const Icon(Icons.exit_to_app, color: Color(0xFFF08833)),
          ),
        ],
      ),
    );
  }

  /// Builds the segmented tab control for agenda status filters.
  Widget _buildTabButtons() {
    return Container(
      decoration: BoxDecoration(
        color: const Color.fromRGBO(22, 27, 34, 0.85),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF30363d)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildTabButton('Pendente', TabState.pendente),
          _buildTabButton('Em Votação', TabState.emVotacao),
          _buildTabButton('Finalizada', TabState.finalizada),
        ],
      ),
    );
  }

  /// Builds a single dashboard tab button.
  Widget _buildTabButton(String text, TabState tabState) {
    final isSelected = _currentTab == tabState;
    return GestureDetector(
      onTap: () {
        setState(() {
          _currentTab = tabState;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF58a6ff) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: Colors.white,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  /// Builds the current tab view based on [_currentTab].
  Widget _buildCurrentView() {
    switch (_currentTab) {
      case TabState.pendente:
        return _buildPendenteView();
      case TabState.emVotacao:
        return _buildEmVotacaoView();
      case TabState.finalizada:
        return _buildFinalizadasView();
    }
  }

  /// Builds the pending-agenda list and its empty/loading states.
  Widget _buildPendenteView() {
    if (_isLoadingPautas) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF58a6ff)),
      );
    }

    if (_pautasPendentes.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Icon(Icons.check_circle_outline, size: 64, color: Colors.grey),
              SizedBox(height: 16),
              Text(
                'Nenhuma pauta pendente',
                style: TextStyle(fontSize: 18, color: Colors.grey),
              ),
            ],
          ),
        ),
      );
    }

    final hasMore = _pautasPage < _pautasTotalPages;
    final extraItem = (hasMore || _isLoadingMorePautas) ? 1 : 0;

    return Expanded(
      child: NotificationListener<ScrollNotification>(
        onNotification: _onScrollNotification,
        child: ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          itemCount: _pautasPendentes.length + extraItem,
          itemBuilder: (context, index) {
            if (index >= _pautasPendentes.length) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 16.0),
                child: Center(
                  child: _isLoadingMorePautas
                      ? const CircularProgressIndicator(
                          color: Color(0xFF58a6ff),
                        )
                      : const SizedBox.shrink(),
                ),
              );
            }

            final pauta = _pautasPendentes[index];
            return GestureDetector(
              onTap: () => _handlePautaTap(pauta, 'Pendente'),
              child: _VotacaoCard(
                tema: pauta['nome'] ?? 'Pauta sem nome',
                meuVoto: VotoTipo.naoVotado,
                status: 'Pendente',
                statusColor: const Color(0xFFF0E333),
                description: pauta['descricao'] ?? '',
                autor: pauta['autor'] ?? 'Não informado',
                showVoto: false,
              ),
            );
          },
        ),
      ),
    );
  }

  /// Builds the live-voting agenda list and its empty/loading states.
  Widget _buildEmVotacaoView() {
    if (_isLoadingPautas) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF58a6ff)),
      );
    }

    if (_pautasEmVotacao.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Icon(Icons.how_to_vote_outlined, size: 64, color: Colors.grey),
              SizedBox(height: 16),
              Text(
                'Nenhuma pauta em votação',
                style: TextStyle(fontSize: 18, color: Colors.grey),
              ),
            ],
          ),
        ),
      );
    }

    final hasMore = _pautasPage < _pautasTotalPages;
    final extraItem = (hasMore || _isLoadingMorePautas) ? 1 : 0;

    return Expanded(
      child: NotificationListener<ScrollNotification>(
        onNotification: _onScrollNotification,
        child: ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          itemCount: _pautasEmVotacao.length + extraItem,
          itemBuilder: (context, index) {
            if (index >= _pautasEmVotacao.length) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 16.0),
                child: Center(
                  child: _isLoadingMorePautas
                      ? const CircularProgressIndicator(
                          color: Color(0xFF58a6ff),
                        )
                      : const SizedBox.shrink(),
                ),
              );
            }

            final pauta = _pautasEmVotacao[index];
            return GestureDetector(
              onTap: () => _handlePautaTap(pauta, 'Em Votação'),
              child: _VotacaoCard(
                tema: pauta['nome'] ?? 'Pauta sem nome',
                meuVoto: _getVotoFromData(pauta['id']),
                status: 'Em Votação',
                statusColor: const Color(0xFF58a6ff),
                description: pauta['descricao'] ?? '',
                autor: pauta['autor'] ?? 'Não informado',
                showVoto: true,
              ),
            );
          },
        ),
      ),
    );
  }

  /// Builds the finalized-agenda list with vote results and statistics.
  Widget _buildFinalizadasView() {
    if (_isLoadingPautas) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF58a6ff)),
      );
    }

    if (_pautasFinalizadas.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Icon(Icons.task_alt_outlined, size: 64, color: Colors.grey),
              SizedBox(height: 16),
              Text(
                'Nenhuma pauta finalizada',
                style: TextStyle(fontSize: 18, color: Colors.grey),
              ),
            ],
          ),
        ),
      );
    }

    final hasMore = _pautasPage < _pautasTotalPages;
    final extraItem = (hasMore || _isLoadingMorePautas) ? 1 : 0;

    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 8.0, bottom: 16.0),
              child: Text(
                'Votações Finalizadas',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFe6edf3),
                ),
              ),
            ),
            Expanded(
              child: NotificationListener<ScrollNotification>(
                onNotification: _onScrollNotification,
                child: ListView.builder(
                  itemCount: _pautasFinalizadas.length + extraItem,
                  itemBuilder: (context, index) {
                    if (index >= _pautasFinalizadas.length) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 16.0),
                        child: Center(
                          child: _isLoadingMorePautas
                              ? const CircularProgressIndicator(
                                  color: Color(0xFF58a6ff),
                                )
                              : const SizedBox.shrink(),
                        ),
                      );
                    }

                    final pauta = _pautasFinalizadas[index];
                    return _VotacaoCard(
                      tema: pauta['nome'] ?? 'Pauta sem nome',
                      meuVoto: _getVotoFromData(pauta['id']),
                      status: _getStatusFromResult(pauta),
                      statusColor: _getStatusColor(pauta),
                      description: pauta['descricao'] ?? '',
                      autor: pauta['autor'] ?? 'Não informado',
                      showVoto: true,
                      estatisticas:
                          _votosVereador[pauta['id']]?['estatisticas'],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Agenda card used by the council member dashboard lists.
class _VotacaoCard extends StatelessWidget {
  /// Agenda title shown as the main card label.
  final String tema;

  /// Vote registered by the current council member.
  final VotoTipo meuVoto;

  /// Agenda status or final result label.
  final String status;

  /// Primary color used by the status badge.
  final Color statusColor;

  /// Optional agenda summary.
  final String? description;

  /// Optional agenda author name.
  final String? autor;

  /// Whether the current council member vote should be displayed.
  final bool showVoto;

  /// Optional final vote counters for approved or rejected agendas.
  final Map<String, dynamic>? estatisticas;

  /// Creates an agenda voting card.
  const _VotacaoCard({
    required this.tema,
    required this.meuVoto,
    required this.status,
    required this.statusColor,
    this.description,
    this.autor,
    this.showVoto = true,
    this.estatisticas,
  });

  /// Returns the display label and color for [meuVoto].
  Map<String, dynamic> _getVotoStyle() {
    switch (meuVoto) {
      case VotoTipo.sim:
        return {'text': 'sim', 'color': const Color(0xFF2EA043)};
      case VotoTipo.nao:
        return {'text': 'não', 'color': const Color(0xFFDA3633)};
      case VotoTipo.abstencao:
        return {'text': 'abstenção', 'color': const Color(0xFFF08833)};
      case VotoTipo.naoVotado:
        return {'text': 'Não votado', 'color': Colors.grey[700]!};
    }
  }

  @override
  Widget build(BuildContext context) {
    final votoStyle = _getVotoStyle();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    tema,
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                // Finalized agendas show both lifecycle status and vote result.
                if (status.toLowerCase() == 'aprovada' ||
                    status.toLowerCase() == 'reprovada') ...[
                  _buildBasicStatusBadge('FINALIZADA'),
                  const SizedBox(width: 8),
                  _buildStatusBadge(),
                ] else
                  _buildStatusBadge(),
              ],
            ),
            if (description?.isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                description!,
                style: const TextStyle(fontSize: 14, color: Colors.white70),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            if (autor?.isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                'Autor: $autor',
                style: const TextStyle(fontSize: 12, color: Colors.white60),
              ),
            ],
            if (showVoto) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text(
                    'Meu voto: ',
                    style: TextStyle(fontSize: 14, color: Colors.white70),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: votoStyle['color'],
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      votoStyle['text'],
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            if (estatisticas != null &&
                (status == 'Aprovada' || status == 'Reprovada')) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.1),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildVoteCount(
                      'SIM',
                      estatisticas!['sim'] ?? 0,
                      const Color(0xFF2EA043),
                    ),
                    _buildVoteCount(
                      'NÃO',
                      estatisticas!['nao'] ?? 0,
                      const Color(0xFFDA3633),
                    ),
                    _buildVoteCount(
                      'ABSTENÇÃO',
                      estatisticas!['abstencao'] ?? 0,
                      const Color(0xFFF08833),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Builds a compact vote counter for finalized-agenda statistics.
  Widget _buildVoteCount(String label, int count, Color color) {
    return Column(
      children: [
        Text(
          count.toString(),
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.white60),
        ),
      ],
    );
  }

  /// Builds the lifecycle badge shown before approved/rejected result badges.
  Widget _buildBasicStatusBadge(String badgeStatus) {
    Color backgroundColor;
    Color textColor;
    Color borderColor;

    switch (badgeStatus.toLowerCase()) {
      case 'finalizada':
        backgroundColor = const Color.fromRGBO(46, 160, 67, 0.2);
        textColor = const Color(0xFF71e67f);
        borderColor = const Color.fromRGBO(46, 160, 67, 0.4);
        break;
      default:
        backgroundColor = const Color.fromRGBO(240, 227, 51, 0.2);
        textColor = const Color.fromRGBO(233, 241, 110, 1);
        borderColor = const Color.fromRGBO(240, 227, 51, 0.4);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: borderColor),
      ),
      child: Text(
        badgeStatus.toUpperCase(),
        style: TextStyle(
          color: textColor,
          fontSize: 10,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  /// Builds the status or result badge for the agenda card.
  Widget _buildStatusBadge() {
    if (status.toLowerCase() == 'aprovada' ||
        status.toLowerCase() == 'reprovada') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: statusColor.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: statusColor.withValues(alpha: 0.6)),
        ),
        child: Text(
          status.toUpperCase(),
          style: TextStyle(
            color: statusColor,
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    Color backgroundColor;
    Color textColor;
    Color borderColor;

    switch (status.toLowerCase()) {
      case 'pendente':
        backgroundColor = const Color.fromRGBO(240, 227, 51, 0.2);
        textColor = const Color.fromRGBO(233, 241, 110, 1);
        borderColor = const Color.fromRGBO(240, 227, 51, 0.4);
        break;
      case 'em votação':
        backgroundColor = const Color.fromRGBO(88, 166, 255, 0.2);
        textColor = Colors.cyan;
        borderColor = const Color.fromRGBO(88, 166, 255, 0.4);
        break;
      case 'finalizada':
        backgroundColor = const Color.fromRGBO(46, 160, 67, 0.2);
        textColor = const Color(0xFF71e67f);
        borderColor = const Color.fromRGBO(46, 160, 67, 0.4);
        break;
      default:
        backgroundColor = const Color.fromRGBO(240, 227, 51, 0.2);
        textColor = const Color.fromRGBO(233, 241, 110, 1);
        borderColor = const Color.fromRGBO(240, 227, 51, 0.4);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: borderColor),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(
          color: textColor,
          fontSize: 10,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
