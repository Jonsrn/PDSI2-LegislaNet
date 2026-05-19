import 'package:flutter/material.dart';

// Enum para controlar qual opção de voto está selecionada
/// Defines the available voting choices for the agenda voting screen.
///
/// This enum is used to track which vote option the user has currently
/// selected, including the state where no option has been chosen yet.
enum VotoOpcao { sim, nao, abstencao, nenhum }

/// Displays the voting details screen for a specific agenda item.
///
/// This screen presents agenda information, an attachment preview action, and
/// selectable vote options for the user to confirm.
class VotacaoPautaScreen extends StatefulWidget {
  /// Creates the agenda voting screen.
  ///
  /// Args:
  ///   key: The widget key used to preserve this widget's identity in the
  ///     widget tree.
  const VotacaoPautaScreen({super.key});

  @override
  /// Creates the mutable state for [VotacaoPautaScreen].
  ///
  /// Returns:
  ///   A [_VotacaoPautaScreenState] instance that manages the selected vote.
  State<VotacaoPautaScreen> createState() => _VotacaoPautaScreenState();
}

/// Holds the interactive state for [VotacaoPautaScreen].
///
/// This state object stores the currently selected vote option and builds the
/// interface for viewing agenda details and casting a vote.
class _VotacaoPautaScreenState extends State<VotacaoPautaScreen> {
  // Variável de estado para guardar a opção de voto escolhida
  VotoOpcao _votoSelecionado = VotoOpcao.nenhum;

  @override
  /// Builds the agenda voting screen layout.
  ///
  /// Args:
  ///   context: The build context used to access inherited widgets, theme
  ///     values, and navigation.
  ///
  /// Returns:
  ///   A [Scaffold] containing the app bar, voting details, vote options, and
  ///   the confirmation button.
  Widget build(BuildContext context) {
    return Scaffold(
      // Barra de topo customizada
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16.0),
            child: Chip(
              label: const Text(
                'Em Votação',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              backgroundColor: const Color(0xFFF08833),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
          ),
        ],
      ),
      // Botão de confirmar fixo na parte inferior
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.all(16.0),
        child: ElevatedButton(
          onPressed: () {
            if (_votoSelecionado != VotoOpcao.nenhum) {
              Navigator.of(context).pop();
            }
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF2F81F7),
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8.0),
            ),
          ),
          child: const Text(
            'Confirmar Voto',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Denúncia - 2ª votação',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),
            _buildInfoRow('Autor', 'Mesa Diretora da Câmara'),
            _buildInfoRow(
              'Descrição',
              'Denúncia com pedido de instauração de Comissão Parlamentar de Inquérito',
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                leading: const Icon(
                  Icons.visibility_outlined,
                  color: Color(0xFF58A6FF),
                ),
                title: const Text(
                  'Visualizar anexo',
                  style: TextStyle(
                    color: Color(0xFF58A6FF),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                onTap: () {},
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'Escolha seu voto',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            // MODIFICAÇÃO: Ícones atualizados para as versões preenchidas
            _buildVotoOption(
              label: 'SIM',
              icon: Icons.check_circle, // Ícone preenchido
              opcao: VotoOpcao.sim,
            ),
            _buildVotoOption(
              label: 'NÃO',
              icon: Icons.cancel, // Ícone preenchido
              opcao: VotoOpcao.nao,
            ),
            _buildVotoOption(
              label: 'ABSTENÇÃO',
              icon: Icons.remove_circle, // Ícone preenchido
              opcao: VotoOpcao.abstencao,
            ),
          ],
        ),
      ),
    );
  }

  /// Builds a labeled information row for agenda metadata.
  ///
  /// Args:
  ///   label: The field name displayed above the value.
  ///   value: The descriptive text shown for the field.
  ///
  /// Returns:
  ///   A padded widget containing the label and its corresponding value.
  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 14, color: Colors.grey[400])),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(fontSize: 16, color: Colors.white),
          ),
        ],
      ),
    );
  }

  /// Builds a selectable card representing a vote option.
  ///
  /// Args:
  ///   label: The text displayed for the vote option.
  ///   icon: The icon shown beside the option label.
  ///   opcao: The vote value associated with the option.
  ///
  /// Returns:
  ///   A [Card] widget that highlights the selected state and updates the
  ///   current vote when tapped.
  Widget _buildVotoOption({
    required String label,
    required IconData icon,
    required VotoOpcao opcao,
  }) {
    final bool isSelected = _votoSelecionado == opcao;

    final Color optionColor;
    switch (opcao) {
      case VotoOpcao.sim:
        optionColor = const Color(0xFF2EA043); // Verde
        break;
      case VotoOpcao.nao:
        optionColor = const Color(0xFFDA3633); // Vermelho
        break;
      case VotoOpcao.abstencao:
        optionColor = const Color(0xFFF08833); // Laranja
        break;
      default:
        optionColor = Colors.grey;
    }

    return Card(
      color: isSelected ? optionColor.withOpacity(0.15) : null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: isSelected
            ? BorderSide(color: optionColor, width: 2)
            : BorderSide.none,
      ),
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        onTap: () {
          setState(() {
            _votoSelecionado = opcao;
          });
        },
        leading: Icon(
          icon,
          // MODIFICAÇÃO: Cor do ícone agora é permanente, não depende mais da seleção
          color: optionColor,
          size: 28,
        ),
        title: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isSelected ? optionColor : Colors.white,
          ),
        ),
      ),
    );
  }
}
