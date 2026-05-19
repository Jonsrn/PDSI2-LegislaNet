import 'package:flutter/material.dart';
import 'votacao_pauta_screen.dart'; // Importação Relativa da nova tela

/// Defines the possible voting states that can be displayed for a council
/// member.
///
/// This enum is used by the dashboard cards to determine the label and visual
/// styling shown for the current user's vote.
enum VotoTipo { sim, nao, abstencao, naoVotado }

/// Displays the council member dashboard with ongoing and completed votes.
///
/// This screen shows a greeting header, a toggle to switch between voting
/// sections, and the corresponding list of voting cards for the selected view.
class DashboardVereadorScreen extends StatefulWidget {
  /// Creates a dashboard screen for the council member area.
  ///
  /// Args:
  ///   key: The widget key used to control how this widget replaces another
  ///     widget in the tree.
  const DashboardVereadorScreen({super.key});

  @override
  /// Creates the mutable state for [DashboardVereadorScreen].
  ///
  /// Returns:
  ///   A [_DashboardVereadorScreenState] instance that manages the selected
  ///   dashboard tab.
  State<DashboardVereadorScreen> createState() =>
      _DashboardVereadorScreenState();
}

/// Holds the UI state for [DashboardVereadorScreen].
///
/// This state object manages whether the dashboard is showing ongoing votes or
/// completed votes.
class _DashboardVereadorScreenState extends State<DashboardVereadorScreen> {
  bool _showFinalizadas = false;

  @override
  /// Builds the main dashboard layout.
  ///
  /// Args:
  ///   context: The build context used to access inherited widgets and theme
  ///     data.
  ///
  /// Returns:
  ///   A [Scaffold] containing the header, section toggle, and the currently
  ///   selected voting content.
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            const SizedBox(height: 24),
            _buildToggleButtons(),
            const SizedBox(height: 24),
            if (_showFinalizadas)
              _buildFinalizadasView()
            else
              _buildEmAndamentoView(),
          ],
        ),
      ),
    );
  }

  /// Builds the greeting header displayed at the top of the dashboard.
  ///
  /// Returns:
  ///   A styled [Container] with the council member avatar, greeting text, and
  ///   an exit action button.
  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16.0),
      margin: const EdgeInsets.symmetric(horizontal: 16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color, // Cor do card vinda do tema
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 35, // Tamanho ajustado
            backgroundImage: NetworkImage('https://i.imgur.com/5h25c3G.png'),
          ), //
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Boa tarde Vereador,',
                  style: TextStyle(fontSize: 16, color: Colors.white70),
                ),
                const Text(
                  'DE ASSIS DANTAS',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ), //
                const SizedBox(height: 4),
                const Text(
                  'Câmara municipal de Dom Expedito Lopes, 08 de agosto de 2025',
                  style: TextStyle(fontSize: 12, color: Colors.white60),
                ), //
              ],
            ),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.exit_to_app, color: Color(0xFFF08833)), //
          ),
        ],
      ),
    );
  }

  /// Builds the segmented toggle used to switch dashboard sections.
  ///
  /// Returns:
  ///   A [Container] with buttons for the ongoing and completed voting views.
  Widget _buildToggleButtons() {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color, // Cor do tema
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildToggleButton('Em Andamento', !_showFinalizadas), //
          _buildToggleButton('Finalizada', _showFinalizadas), //
        ],
      ),
    );
  }

  /// Builds an individual toggle button for the dashboard section selector.
  ///
  /// Args:
  ///   text: The label shown inside the toggle button.
  ///   isSelected: Whether this button represents the currently active section.
  ///
  /// Returns:
  ///   A tappable widget that updates the selected dashboard section when
  ///   pressed.
  Widget _buildToggleButton(String text, bool isSelected) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _showFinalizadas = text == 'Finalizada';
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF2F81F7) : Colors.transparent, //
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: Colors.white,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  // Adicionado card "Não votado" com navegação
  /// Builds the content for the ongoing votes section.
  ///
  /// Returns:
  ///   A padded layout containing the current active voting card and navigation
  ///   to the voting details screen.
  Widget _buildEmAndamentoView() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      child: Column(
        children: [
          // Card para pauta não votada
          GestureDetector(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => const VotacaoPautaScreen(),
                ),
              );
            },
            child: const _VotacaoCard(
              tema: 'Projeto de Lei 101/2025 - 1ª votação',
              meuVoto: VotoTipo.naoVotado,
              status: 'Em Andamento',
              statusColor: Color(0xFF2EA043),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds the content for the completed votes section.
  ///
  /// Returns:
  ///   An [Expanded] widget containing a scrollable list of finalized voting
  ///   cards.
  Widget _buildFinalizadasView() {
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
                  color: Colors.white,
                ),
              ), //
            ),
            Expanded(
              child: ListView(
                children: const [
                  _VotacaoCard(
                    tema: 'Denúncia - 2ª votação', //
                    meuVoto: VotoTipo.sim,
                    status:
                        'Aprovado - 6 votos Sim - 0 votos Não - 0 abstenções', //
                    statusColor: Color(0xFF2EA043),
                  ),
                  _VotacaoCard(
                    tema: 'Denúncia - 1ª votação', //
                    meuVoto: VotoTipo.nao,
                    status:
                        'Aprovado - 7 votos Sim - 0 votos Não - 0 abstenções', //
                    statusColor: Color(0xFF2EA043),
                  ),
                  _VotacaoCard(
                    tema: 'PROJETO DE LEI 030/2025 - 2ª votação', //
                    meuVoto: VotoTipo.naoVotado,
                    status:
                        'Reprovado - 0 votos Sim - 0 votos Não - 0 abstenções', //
                    statusColor: Color(0xFFDA3633),
                  ),
                  _VotacaoCard(
                    tema: 'PROJETO DE LEI 030/2025 - 1ª votação',
                    meuVoto: VotoTipo.abstencao,
                    status:
                        'Aprovado - 9 votos Sim - 0 votos Não - 0 abstenções',
                    statusColor: Color(0xFF2EA043),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Displays a summary card for a voting item.
///
/// The card presents the topic, the current user's vote, and a status summary
/// with the appropriate highlight color.
class _VotacaoCard extends StatelessWidget {
  final String tema;
  final VotoTipo meuVoto;
  final String status;
  final Color statusColor;

  /// Creates a voting summary card.
  ///
  /// Args:
  ///   tema: The voting topic shown as the main title of the card.
  ///   meuVoto: The current user's vote type used to determine the badge text
  ///     and color.
  ///   status: The voting result or current state text displayed on the card.
  ///   statusColor: The color used to render the status text.
  const _VotacaoCard({
    required this.tema,
    required this.meuVoto,
    required this.status,
    required this.statusColor,
  });

  /// Returns the label and color associated with the current vote type.
  ///
  /// Returns:
  ///   A map containing the formatted vote `text` and its display `color`.
  Map<String, dynamic> _getVotoStyle() {
    switch (meuVoto) {
      case VotoTipo.sim:
        return {'text': 'sim', 'color': const Color(0xFF2EA043)}; //
      case VotoTipo.nao:
        return {'text': 'não', 'color': const Color(0xFFDA3633)};
      case VotoTipo.abstencao:
        return {'text': 'abstenção', 'color': const Color(0xFFF08833)};
      case VotoTipo.naoVotado:
        return {'text': 'Não votado', 'color': Colors.grey[700]!}; //
    }
  }

  @override
  /// Builds the visual representation of the voting card.
  ///
  /// Args:
  ///   context: The build context used to resolve inherited theme information.
  ///
  /// Returns:
  ///   A [Card] widget containing the topic, vote badge, and status
  ///   information.
  Widget build(BuildContext context) {
    final votoStyle = _getVotoStyle();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Tema: $tema',
              style: const TextStyle(
                fontSize: 16,
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
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
                Text(
                  status,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
