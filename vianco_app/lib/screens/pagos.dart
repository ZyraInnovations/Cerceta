import 'dart:io';
import 'dart:convert'; // ✅ AÑADE ESTA LÍNEA
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as path;
import 'package:async/async.dart';

class NuevoPagoScreen extends StatefulWidget {
  final String userId;
  const NuevoPagoScreen({Key? key, required this.userId}) : super(key: key);

  @override
  _NuevoPagoScreenState createState() => _NuevoPagoScreenState();
}








class _NuevoPagoScreenState extends State<NuevoPagoScreen> {
  final _formKey = GlobalKey<FormState>();
  DateTime? _fechaPago;
  final TextEditingController _valorPagoController = TextEditingController();
  final TextEditingController _nombreEdificioController = TextEditingController();
  final TextEditingController _numeroApartamentoController = TextEditingController();
String _estado = 'Pagado';
  File? _documentoPago;
  final picker = ImagePicker();

// ✅ AGREGA ESTO:
  int? _apartamentoId;
  int? _edificioId;

  final Color colorPrincipal = Color(0xFF1E99D3);




 @override
@override
void initState() {
  super.initState();
  _fechaPago = DateTime.now(); // ⬅️ Establecer la fecha actual como valor inicial
  cargarInfoUsuario();
}

  @override

Future<void> _pickFile() async {
  final pickedFile = await picker.pickImage(source: ImageSource.gallery);
  if (pickedFile != null) {
    setState(() {
      _documentoPago = File(pickedFile.path);
    });

    // 👇 Aquí va el print
    print('Documento seleccionado: ${_documentoPago!.path}');
  }
}



Future<void> cargarInfoUsuario() async {
  print("Llamando a /info_ususuario/${widget.userId}");

  try {
    final userResponse = await http.get(Uri.parse('https://sistemacerceta.com/info_ususuario/${widget.userId}'));

    if (userResponse.statusCode == 200) {
      final userData = jsonDecode(userResponse.body);
      
      // 👇 CONVIERTE A ENTERO
      final edificioId = int.tryParse(userData['edificio'].toString());
      final apartamentoId = int.tryParse(userData['apartamento'].toString());

      print("Edificio recibido: $edificioId");
      print("Apartamento recibido: $apartamentoId");

      final edificioResponse = await http.get(Uri.parse('https://sistemacerceta.com/edificios/$edificioId'));
      final apartamentoResponse = await http.get(Uri.parse('https://sistemacerceta.com/apartamentos/$apartamentoId'));

      if (edificioResponse.statusCode == 200 && apartamentoResponse.statusCode == 200) {
        final nombreEdificio = jsonDecode(edificioResponse.body)['nombre'];
        final numeroApartamento = jsonDecode(apartamentoResponse.body)['numero'];

        setState(() {
          _edificioId = edificioId;
          _apartamentoId = apartamentoId;
          _nombreEdificioController.text = nombreEdificio ?? '';
          _numeroApartamentoController.text = numeroApartamento.toString();
        });
      } else {
        print('Error al obtener edificio/apartamento');
      }
    } else {
      print('Error al obtener usuario: ${userResponse.body}');
    }
  } catch (e) {
    print('Error en cargarInfoUsuario: $e');
  }
}


  Future<void> _submitPago() async {
 if (_apartamentoId == null || _edificioId == null) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('No se ha cargado la información del apartamento o edificio')),
  );
  return;
}


    var uri = Uri.parse("https://sistemacerceta.com/api/pagos");
    var request = http.MultipartRequest('POST', uri);
request.fields['apartamento_id'] = (_apartamentoId ?? 0).toString();
request.fields['fecha_pago'] = _fechaPago!.toIso8601String();
request.fields['valor_pago'] = _valorPagoController.text;
request.fields['estado'] = _estado;
request.fields['edificio_id'] = (_edificioId ?? 0).toString();


    if (_documentoPago != null) {
var stream = http.ByteStream(_documentoPago!.openRead());
      var length = await _documentoPago!.length();
      var multipartFile = http.MultipartFile('documento_pago', stream, length,
          filename: path.basename(_documentoPago!.path));
      request.files.add(multipartFile);
    }

var response = await request.send();
final responseBody = await http.Response.fromStream(response);
print('Respuesta del servidor: ${responseBody.body}');

    if (response.statusCode == 200) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pago registrado exitosamente')),
      );
      Navigator.pop(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al registrar el pago')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Color(0xFFF1F3F6),
      appBar: AppBar(
        title: Text("Nuevo Pago", style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: colorPrincipal,
        elevation: 0,
      ),
 body: Padding(
  padding: const EdgeInsets.all(20),
  child: Form(
    key: _formKey,
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tu ID de usuario: ${widget.userId}',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.blueGrey,
            ),
          ),
          SizedBox(height: 10),
                label("Fecha de Pago"),
                SizedBox(height: 10),
                GestureDetector(
                  onTap: () async {
                    DateTime? pickedDate = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                      builder: (context, child) {
                        return Theme(
                          data: Theme.of(context).copyWith(
                            colorScheme: ColorScheme.light(
                              primary: colorPrincipal,
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (pickedDate != null) {
                      setState(() {
                        _fechaPago = pickedDate;
                      });
                    }
                  },
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: 14, vertical: 16),
                    decoration: containerDecoration(),
            child: Text(
  _fechaPago == null
      ? "Seleccionar fecha"
      : "${_fechaPago!.toLocal()}".split(' ')[0],
  style: TextStyle(color: Colors.grey.shade700),
),

                  ),
                ),
                SizedBox(height: 20),
buildTextField(_valorPagoController, "Valor del Pago", type: TextInputType.number),
                SizedBox(height: 20),
                buildDropdownField(),
                SizedBox(height: 20),
buildTextField(_nombreEdificioController, "Nombre del Edificio", readOnly: true),
                SizedBox(height: 20),
buildTextField(_numeroApartamentoController, "Número de Apartamento", type: TextInputType.number, readOnly: true),
                SizedBox(height: 20),
                label("Documento de Pago"),
                SizedBox(height: 10),
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 14, vertical: 16),
                  decoration: containerDecoration(),
                  child: Text(
                    _documentoPago == null
                        ? "Ningún archivo seleccionado"
                        : "Archivo: ${path.basename(_documentoPago!.path)}",
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ),
                SizedBox(height: 10),
                ElevatedButton.icon(
                  onPressed: _pickFile,
                  icon: Icon(Icons.upload_file),
                  label: Text("Seleccionar Archivo"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colorPrincipal,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: EdgeInsets.symmetric(vertical: 14, horizontal: 20),
                  ),
                ),
                SizedBox(height: 30),
                Center(
                  child: ElevatedButton(
                    onPressed: _submitPago,
                    child: Text("Registrar Pago"),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colorPrincipal,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      padding: EdgeInsets.symmetric(vertical: 16, horizontal: 40),
                      textStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      elevation: 4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

Widget buildTextField(
  TextEditingController controller,
  String label, {
  TextInputType type = TextInputType.text,
  bool readOnly = false,
}) {
  return TextFormField(
    controller: controller,
    readOnly: readOnly,
    keyboardType: type,
    validator: (value) => value == null || value.isEmpty ? "Este campo es obligatorio" : null,
    decoration: InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: colorPrincipal),
      filled: true,
      fillColor: Colors.white,
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: colorPrincipal, width: 1.5),
        borderRadius: BorderRadius.circular(12),
      ),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
    ),
  );
}

Widget buildDropdownField() {
  return TextFormField(
    initialValue: _estado,
    readOnly: true,
    decoration: InputDecoration(
      labelText: "Estado",
      labelStyle: TextStyle(color: colorPrincipal),
      filled: true,
      fillColor: Colors.white,
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: colorPrincipal, width: 1.5),
        borderRadius: BorderRadius.circular(12),
      ),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
    ),
  );
}

  BoxDecoration containerDecoration() {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [
        BoxShadow(color: Colors.black12, blurRadius: 6, offset: Offset(0, 2))
      ],
    );
  }

  Widget label(String text) {
    return Text(text, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.grey.shade800));
  }
}
