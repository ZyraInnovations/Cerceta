import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as path; // Importar con alias para evitar conflictos
import 'package:async/async.dart';
import 'dart:convert';

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
  String _estado = 'Pendiente'; // Estado por defecto
  File? _documentoPago;

  final picker = ImagePicker();

  // Método para seleccionar imagen o archivo
  Future<void> _pickFile() async {
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);

    if (pickedFile != null) {
      setState(() {
        _documentoPago = File(pickedFile.path);
      });
    }
  }

  // Método para enviar los datos al backend
  Future<void> _submitPago() async {
    if (!_formKey.currentState!.validate() || _fechaPago == null || _documentoPago == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Por favor, completa todos los campos')),
      );
      return;
    }

    var uri = Uri.parse("https://tuservidor.com/api/pagos"); // URL de tu API en Node.js
    var request = http.MultipartRequest('POST', uri);
    
    request.fields['apartamento_id'] = widget.userId;
    request.fields['fecha_pago'] = _fechaPago!.toIso8601String();
    request.fields['valor_pago'] = _valorPagoController.text;
    request.fields['estado'] = _estado;
    request.fields['nombre_edificio'] = _nombreEdificioController.text;
    request.fields['numero_apartamento'] = _numeroApartamentoController.text;

    if (_documentoPago != null) {
      var stream = http.ByteStream(DelegatingStream.typed(_documentoPago!.openRead()));
      var length = await _documentoPago!.length();
      var multipartFile = http.MultipartFile('documento_pago', stream, length,
          filename: path.basename(_documentoPago!.path));
      request.files.add(multipartFile);
    }

    var response = await request.send();

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
      appBar: AppBar(
        title: Text("Nuevo Pago"),
        backgroundColor: Colors.blue,
      ),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Fecha de Pago", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                SizedBox(height: 8),
                InkWell(
                  onTap: () async {
                    DateTime? pickedDate = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (pickedDate != null) {
                      setState(() {
                        _fechaPago = pickedDate;
                      });
                    }
                  },
                  child: Container(
                    padding: EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_fechaPago == null ? "Seleccionar fecha" : "${_fechaPago!.toLocal()}".split(' ')[0]),
                  ),
                ),
                SizedBox(height: 16),
                TextFormField(
                  controller: _valorPagoController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: "Valor del Pago"),
                  validator: (value) {
                    if (value == null || value.isEmpty) return "Ingrese un valor";
                    return null;
                  },
                ),
                SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: _estado,
                  decoration: InputDecoration(labelText: "Estado"),
                  items: ['Pendiente', 'Aprobado', 'Rechazado'].map((String estado) {
                    return DropdownMenuItem<String>(
                      value: estado,
                      child: Text(estado),
                    );
                  }).toList(),
                  onChanged: (value) {
                    setState(() {
                      _estado = value!;
                    });
                  },
                ),
                SizedBox(height: 16),
                TextFormField(
                  controller: _nombreEdificioController,
                  decoration: InputDecoration(labelText: "Nombre del Edificio"),
                  validator: (value) {
                    if (value == null || value.isEmpty) return "Ingrese el nombre del edificio";
                    return null;
                  },
                ),
                SizedBox(height: 16),
                TextFormField(
                  controller: _numeroApartamentoController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: "Número de Apartamento"),
                  validator: (value) {
                    if (value == null || value.isEmpty) return "Ingrese el número de apartamento";
                    return null;
                  },
                ),
                SizedBox(height: 16),
                Text("Documento de Pago", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                SizedBox(height: 8),
                _documentoPago == null
                    ? Text("Ningún archivo seleccionado")
                    : Text("Archivo: ${path.basename(_documentoPago!.path)}"),
                ElevatedButton.icon(
                  onPressed: _pickFile,
                  icon: Icon(Icons.upload_file),
                  label: Text("Seleccionar Archivo"),
                ),
                SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _submitPago,
                  child: Text("Registrar Pago"),
                  style: ElevatedButton.styleFrom(
                    padding: EdgeInsets.symmetric(vertical: 12, horizontal: 20),
                    textStyle: TextStyle(fontSize: 18),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
