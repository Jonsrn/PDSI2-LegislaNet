import 'package:flutter/material.dart';
import 'dart:async';
import 'services/auth_service.dart';
import 'services/websocket_service.dart';

/// Available vote choices for a voting agenda item.
enum VotoOpcao { sim, nao, abstencao, nenhum }

/// Screen that lets a council member vote on an active agenda item.
class VotacaoPautaScreen extends StatefulWidget {
  /// Agenda metadata used to display details and identify the voting room.
  final Map<String, dynamic> pauta;

  /// Creates the voting screen for the provided [pauta].
  const VotacaoPautaScreen({super.key, required this.pauta});

  @override
  State<VotacaoPautaScreen> createState() => _VotacaoPautaScreenState();
}

/// Manages vote selection, submission, statistics, and real-time updates.
class _VotacaoPautaScreenState extends State<VotacaoPautaScreen> {
  /// Currently selected vote option.
  VotoOpcao _votoSelecionado = VotoOpcao.nenhum;

  /// Current WebSocket connection state used by the connection indicator.
  String _connectionStatus = 'connected';

  /// Tracks whether a vote submission is currently in progress.
  bool _isVoting = false;

  /// Indicates whether this screen has successfully registered a vote.
  bool _votoFoiRegistrado = false;

  /// Latest vote statistics for the current agenda item.
  Map<String, dynamic>? _estatisticas;

  /// Tracks whether vote statistics are currently being loaded.
  bool _isLoadingStats = false;

  /// Shared WebSocket service used for live voting updates.
  final WebSocketService _webSocketService = WebSocketService.instance;

  /// Subscription for vote notification events.
  StreamSubscription<Map<String, dynamic>>? _votoNotificationSubscription;

  /// Subscription for live statistics update events.
  StreamSubscription<Map<String, dynamic>>? _statsUpdateSubscription;

  /// Subscription for events that close the current voting session.
  StreamSubscription<Map<String, dynamic>>? _encerrarVotacaoSubscription;

  /// Subscription for WebSocket connection status changes.
  StreamSubscription<String>? _connectionSubscription;

  /// Loads initial data and starts real-time synchronization.
  @override
  void initState() {
    super.initState();
    _loadVereadorData();
    _checkExistingVote();
    _loadEstatisticas();
    _initializeWebSocket();
    _startRealTimeUpdates();
  }

  /// Cancels active subscriptions and leaves the agenda WebSocket room.
  @override
  void dispose() {
    _votoNotificationSubscription?.cancel();
    _statsUpdateSubscription?.cancel();
    _encerrarVotacaoSubscription?.cancel();
    _connectionSubscription?.cancel();
    _webSocketService.leavePauta(widget.pauta['id'].toString());
    super.dispose();
  }

  /// Fetches council member details required by the authenticated session.
  Future<void> _loadVereadorData() async {
    try {
      await AuthService.getVereadorDetails();
    } catch (e) {
      print('Erro ao carregar dados do vereador: $e');
    }
  }

  /// Restores a previously registered vote for this agenda item when present.
  Future<void> _checkExistingVote() async {
    try {
      print(
        '🔍 Verificando se já existe voto para a pauta ${widget.pauta['id']}',
      );

      final response = await AuthService.getVotoEmPauta(
        widget.pauta['id'].toString(),
      );

      if (response != null && response['voto'] != null) {
        final votoData = response['voto'];
        final votoString = votoData['voto'];

        print('✅ Voto existente encontrado: $votoString');

        VotoOpcao votoExistente;
        switch (votoString) {
          case 'SIM':
            votoExistente = VotoOpcao.sim;
            break;
          case 'NÃO':
            votoExistente = VotoOpcao.nao;
            break;
          case 'ABSTENÇÃO':
            votoExistente = VotoOpcao.abstencao;
            break;
          default:
            print('⚠️ Voto desconhecido: $votoString');
            return;
        }

        if (mounted) {
          setState(() {
            _votoSelecionado = votoExistente;
          });

          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Você já votou nesta pauta: ${_getVotoDisplayName(votoExistente)}',
              ),
              backgroundColor: const Color(0xFF58a6ff),
              duration: const Duration(seconds: 3),
            ),
          );
        }
      } else {
        print('ℹ️ Nenhum voto existente encontrado para esta pauta');
      }
    } catch (e) {
      print('❌ Erro ao verificar voto existente: $e');
    }
  }

  /// Converts a [VotoOpcao] value into the label shown to the user.
  String _getVotoDisplayName(VotoOpcao voto) {
    switch (voto) {
      case VotoOpcao.sim:
        return 'SIM';
      case VotoOpcao.nao:
        return 'NÃO';
      case VotoOpcao.abstencao:
        return 'ABSTENÇÃO';
      case VotoOpcao.nenhum:
        return 'NENHUM';
    }
  }

  /// Loads the current vote totals for the agenda item.
  Future<void> _loadEstatisticas() async {
    setState(() {
      _isLoadingStats = true;
    });

    try {
      print('📊 Carregando estatísticas para a pauta ${widget.pauta['id']}');

      final response = await AuthService.getEstatisticasPauta(
        widget.pauta['id'].toString(),
      );

      if (response != null && response['estatisticas'] != null) {
        if (mounted) {
          setState(() {
            _estatisticas = response['estatisticas'];
          });
        }
        print('✅ Estatísticas carregadas: $_estatisticas');
      } else {
        print('⚠️ Nenhuma estatística encontrada');
      }
    } catch (e) {
      print('❌ Erro ao carregar estatísticas: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingStats = false;
        });
      }
    }
  }

  /// Initializes WebSocket listeners for live vote and statistics updates.
  Future<void> _initializeWebSocket() async {
    try {
      _webSocketService.setContext(context);

      await _webSocketService.connect();

      _webSocketService.joinPauta(widget.pauta['id'].toString());

      _votoNotificationSubscription = _webSocketService.votoNotifications
          .listen((data) {
            print('🔔 Notificação de voto recebida: $data');
            if (data['pautaId'] != null &&
                data['pautaId'].toString() == widget.pauta['id'].toString()) {
              _loadEstatisticas();
            }
          });

      _statsUpdateSubscription = _webSocketService.statsUpdates.listen((data) {
        print('📊 Estatísticas atualizadas via WebSocket: $data');
        if (mounted && data['estatisticas'] != null) {
          setState(() {
            _estatisticas = data['estatisticas'];
          });
        }
      });

      _encerrarVotacaoSubscription = _webSocketService.encerrarVotacaoEvents
          .listen((data) {
            print('🏁 Evento de encerramento de votação recebido: $data');
            final pautaIdEncerrada = data['pautaId']?.toString();
            if (pautaIdEncerrada == widget.pauta['id'].toString()) {
              if (mounted) {
                if (_votoFoiRegistrado) {
                  String votoString;
                  switch (_votoSelecionado) {
                    case VotoOpcao.sim:
                      votoString = 'SIM';
                      break;
                    case VotoOpcao.nao:
                      votoString = 'NÃO';
                      break;
                    case VotoOpcao.abstencao:
                      votoString = 'ABSTENÇÃO';
                      break;
                    default:
                      votoString = '';
                  }
                  Navigator.of(
                    context,
                  ).pop({'votoRegistrado': true, 'voto': votoString});
                } else {
                  Navigator.of(context).pop(null);
                }
              }
            }
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

      if (mounted) {
        setState(() {
          _connectionStatus = _webSocketService.isConnected
              ? 'connected'
              : 'disconnected';
        });
      }

      print(
        '✅ WebSocket inicializado com sucesso para a pauta ${widget.pauta['id']}',
      );
    } catch (e) {
      print('❌ Erro ao inicializar WebSocket: $e');
    }
  }

  /// Starts polling for statistics when WebSocket updates are unavailable.
  void _startRealTimeUpdates() {
    if (_webSocketService.isConnected) {
      print(
        '🔌 WebSocket ativo - usando atualizações em tempo real via WebSocket',
      );
      return;
    }

    print('📡 Usando polling como fallback para atualizações em tempo real');
    Future.doWhile(() async {
      if (!mounted) return false;

      await Future.delayed(
        const Duration(milliseconds: 1500),
      );

      if (_webSocketService.isConnected) {
        print('🔌 WebSocket conectou - parando polling');
        return false;
      }

      if (mounted) {
        await _loadEstatisticas();
      }

      return mounted;
    });
  }

  /// Validates and submits the selected vote to the backend.
  Future<void> _submitVote() async {
    if (_votoSelecionado == VotoOpcao.nenhum) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Por favor, selecione uma opção de voto'),
          backgroundColor: Color(0xFFF08833),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    setState(() {
      _isVoting = true;
    });

    try {
      String votoString;
      switch (_votoSelecionado) {
        case VotoOpcao.sim:
          votoString = 'Sim';
          break;
        case VotoOpcao.nao:
          votoString = 'Não';
          break;
        case VotoOpcao.abstencao:
          votoString = 'Abstenção';
          break;
        case VotoOpcao.nenhum:
          return;
      }

      print('🗳️ Enviando voto: $votoString para pauta ${widget.pauta['id']}');

      final response = await AuthService.registrarVoto(
        widget.pauta['id'],
        votoString,
      );

      if (response != null && response['success'] != false) {
        setState(() {
          _votoFoiRegistrado = true;
        });

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Voto registrado com sucesso!'),
            backgroundColor: Color(0xFF2EA043),
            duration: Duration(seconds: 2),
          ),
        );

        await _loadEstatisticas();
      } else {
        final errorMessage = response?['error'] ?? 'Erro ao registrar voto';
        throw Exception(errorMessage);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao registrar voto: $e'),
          backgroundColor: const Color(0xFFDA3633),
          duration: const Duration(seconds: 3),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isVoting = false;
        });
      }
    }
  }

  /// Builds the voting screen layout and connection indicator.
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0d1117),
      appBar: AppBar(
        backgroundColor: const Color(0xFF21262d),
        title: const Text(
          'Votação de Pauta',
          style: TextStyle(color: Colors.white),
        ),
        leading: IconButton(
          onPressed: () {
            if (_votoFoiRegistrado) {
              String votoString;
              switch (_votoSelecionado) {
                case VotoOpcao.sim:
                  votoString = 'SIM';
                  break;
                case VotoOpcao.nao:
                  votoString = 'NÃO';
                  break;
                case VotoOpcao.abstencao:
                  votoString = 'ABSTENÇÃO';
                  break;
                default:
                  votoString = '';
              }
              Navigator.of(
                context,
              ).pop({'votoRegistrado': true, 'voto': votoString});
            } else {
              Navigator.of(context).pop(null);
            }
          },
          icon: const Icon(Icons.arrow_back, color: Colors.white),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16, top: 8, bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight:
                  MediaQuery.of(context).size.height -
                  AppBar().preferredSize.height -
                  MediaQuery.of(context).padding.top -
                  MediaQuery.of(context).padding.bottom -
                  40,
            ),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildPautaInfo(),
                  const SizedBox(height: 20),
                  _buildVotingOptions(),
                  const SizedBox(height: 20),
                  _buildEstatisticasCard(),
                  const SizedBox(height: 20),
                  _buildVoteButton(),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Builds the agenda summary card shown above the voting controls.
  Widget _buildPautaInfo() {
    return Card(
      color: const Color(0xFF21262d),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.blue, width: 1),
                  ),
                  child: const Text(
                    'EM VOTAÇÃO',
                    style: TextStyle(
                      color: Colors.blue,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              widget.pauta['nome'] ?? 'Nome da pauta não disponível',
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            if (widget.pauta['descricao'] != null &&
                widget.pauta['descricao'].isNotEmpty)
              Text(
                widget.pauta['descricao'],
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.white70,
                  height: 1.4,
                ),
              ),
            const SizedBox(height: 12),
            if (widget.pauta['autor'] != null)
              Row(
                children: [
                  const Icon(Icons.person, color: Colors.white60, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    'Autor: ${widget.pauta['autor']}',
                    style: const TextStyle(fontSize: 14, color: Colors.white60),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Builds the group of selectable vote options.
  Widget _buildVotingOptions() {
    return Card(
      color: const Color(0xFF21262d),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.how_to_vote, color: Colors.white, size: 20),
                SizedBox(width: 8),
                Text(
                  'Seu Voto',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildEnhancedVoteOption(
              VotoOpcao.sim,
              'SIM',
              'Favorável à aprovação',
              Colors.green,
              Icons.thumb_up,
            ),
            const SizedBox(height: 12),
            _buildEnhancedVoteOption(
              VotoOpcao.nao,
              'NÃO',
              'Contrário à aprovação',
              Colors.red,
              Icons.thumb_down,
            ),
            const SizedBox(height: 12),
            _buildEnhancedVoteOption(
              VotoOpcao.abstencao,
              'ABSTENÇÃO',
              'Não manifesta opinião',
              Colors.orange,
              Icons.remove_circle_outline,
            ),
          ],
        ),
      ),
    );
  }

  /// Builds a selectable vote option with visual selected state.
  Widget _buildEnhancedVoteOption(
    VotoOpcao opcao,
    String titulo,
    String descricao,
    Color cor,
    IconData icone,
  ) {
    final isSelected = _votoSelecionado == opcao;

    return GestureDetector(
      onTap: () {
        setState(() {
          _votoSelecionado = opcao;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? cor.withValues(alpha: 0.15)
              : const Color(0xFF0d1117),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? cor : Colors.grey[700]!,
            width: isSelected ? 3 : 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: cor.withValues(alpha: 0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? cor : Colors.grey[600]!,
                  width: 2,
                ),
                color: isSelected ? cor : Colors.transparent,
              ),
              child: isSelected
                  ? const Icon(Icons.check, color: Colors.white, size: 16)
                  : null,
            ),
            const SizedBox(width: 16),
            Icon(icone, color: isSelected ? cor : Colors.grey[400], size: 24),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isSelected ? cor : Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    descricao,
                    style: TextStyle(
                      fontSize: 14,
                      color: isSelected
                          ? cor.withValues(alpha: 0.8)
                          : Colors.grey[400],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Builds the vote submission button and disabled/loading states.
  Widget _buildVoteButton() {
    final isDisabled = _votoSelecionado == VotoOpcao.nenhum || _isVoting;

    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        onPressed: isDisabled ? null : _submitVote,
        style: ElevatedButton.styleFrom(
          backgroundColor: isDisabled
              ? Colors.grey[700]
              : const Color(0xFF58a6ff),
          disabledBackgroundColor: Colors.grey[700],
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: isDisabled ? 0 : 4,
        ),
        child: _isVoting
            ? const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  ),
                  SizedBox(width: 12),
                  Text(
                    'Enviando voto...',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.check_circle, color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    isDisabled && !_isVoting
                        ? 'Selecione uma opção'
                        : 'CONFIRMAR VOTO',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDisabled && !_isVoting
                          ? Colors.grey[400]
                          : Colors.white,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  /// Builds the live statistics card for the current agenda item.
  Widget _buildEstatisticasCard() {
    return Card(
      color: const Color(0xFF21262d),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.bar_chart, color: Colors.white, size: 20),
                const SizedBox(width: 8),
                const Text(
                  'Votos em Tempo Real',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                if (_isLoadingStats)
                  const Padding(
                    padding: EdgeInsets.only(left: 12),
                    child: SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.blue,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (_estatisticas != null) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildStatItem(
                    'SIM',
                    _estatisticas!['sim']?.toString() ?? '0',
                    Colors.green,
                    Icons.thumb_up,
                  ),
                  _buildStatItem(
                    'NÃO',
                    _estatisticas!['nao']?.toString() ?? '0',
                    Colors.red,
                    Icons.thumb_down,
                  ),
                  _buildStatItem(
                    'ABSTENÇÃO',
                    _estatisticas!['abstencao']?.toString() ?? '0',
                    Colors.orange,
                    Icons.remove_circle_outline,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  vertical: 8,
                  horizontal: 12,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF0d1117),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[700]!),
                ),
                child: Text(
                  'Total de votos: ${_estatisticas!['total']?.toString() ?? '0'}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ] else ...[
              const Center(
                child: Text(
                  'Carregando estatísticas...',
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Builds a single statistics tile for one vote category.
  Widget _buildStatItem(
    String label,
    String count,
    Color color,
    IconData icon,
  ) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 8),
            Text(
              count,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: color.withValues(alpha: 0.8),
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  /// Returns the connection indicator color for the current status.
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

  /// Returns the connection indicator icon for the current status.
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

  /// Returns the connection indicator text for the current status.
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
}
