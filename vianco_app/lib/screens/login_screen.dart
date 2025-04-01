import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'home_screen.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'register_screen.dart';
import 'package:local_auth/local_auth.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;

Future<void> _loginWithBiometrics() async {
  final LocalAuthentication auth = LocalAuthentication();
  final prefs = await SharedPreferences.getInstance();

  bool hasBiometric = prefs.getBool('has_biometric_login') ?? false;
  if (!hasBiometric) {
    _showMessage("Primero inicia sesión con tu correo y contraseña.");
    return;
  }

  try {
    bool canCheckBiometrics = await auth.canCheckBiometrics;
    bool isDeviceSupported = await auth.isDeviceSupported();
    bool isAuthenticated = false;

    if (canCheckBiometrics && isDeviceSupported) {
      isAuthenticated = await auth.authenticate(
        localizedReason: 'Escanea tu huella o rostro para ingresar',
        options: AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    }

    if (isAuthenticated) {
      final String? savedEmail = prefs.getString('user_email');
      final String? savedPassword = prefs.getString('user_password');

      if (savedEmail != null && savedPassword != null) {
        // Usa el login normal pero con datos guardados
        _emailController.text = savedEmail;
        _passwordController.text = savedPassword;
        await _login(); // ⬅️ login normal con datos recuperados
      } else {
        _showMessage("No hay datos guardados para ingresar.");
      }
    } else {
      _showMessage("Autenticación cancelada o fallida.");
    }
  } catch (e) {
    _showMessage("Error de autenticación biométrica: $e");
  }
}

  Future<void> _login() async {
    print("🔵 Iniciando sesión...");

    setState(() => _isLoading = true);


    
    final prefs = await SharedPreferences.getInstance();

    final String email = _emailController.text.trim();
    final String password = _passwordController.text.trim();
    final String url = 'http://localhost:3000/login_app';

    try {
      String? fcmToken = await FirebaseMessaging.instance.getToken();
      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'email': email,
          'password': password,
          'fcm_token': fcmToken,
        }),
      );

      print("🟢 Respuesta del servidor: ${response.body}");
      final responseData = json.decode(response.body);

      if (response.statusCode == 200 &&
          responseData['user_id'] != null &&
          responseData['token'] != null) {
await _saveSession(
  responseData['token'],
  responseData['user_id'].toString(),
  email,
  password,
);
        // Guarda el flag para que se permita el acceso biométrico en el futuro
        await prefs.setBool('has_biometric_login', true);
        _navigateToHome(responseData['user_id'].toString());
      } else {
        _showMessage(responseData['message'] ?? 'Error al iniciar sesión');
      }
    } catch (error) {
      _showMessage('❌ No se pudo conectar al servidor: $error');
      print("🔴 Error en la conexión: $error");
    } finally {
      setState(() => _isLoading = false);
    }
  }

Future<void> _saveSession(String token, String userId, String email, String password) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_token', token);
    await prefs.setString('user_id', userId);
    await prefs.setString('user_email', email);       // 👈 nuevo
    await prefs.setString('user_password', password); // 👈 nuevo
    print("✅ Sesión guardada correctamente");
  } catch (error) {
    print("🔴 Error al guardar sesión: $error");
  }
}


  void _navigateToHome(String userId) {
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => HomeScreen(userId: userId),
        ),
      );
      print("🟢 Navegando a HomeScreen");
    }
  }

  void _showMessage(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFedf5ff), Color(0xFFe1ecf7)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
            child: AnimatedContainer(
              duration: Duration(milliseconds: 600),
              curve: Curves.easeOutExpo,
              padding: EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.96),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 25,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  AnimatedOpacity(
                    opacity: 1.0,
                    duration: Duration(milliseconds: 1000),
                    child: Image.asset(
                      'assets/images/2022cercetafinal_blanco.png',
                      height: 100,
                    ),
                  ),
                  SizedBox(height: 20),
                  Text(
                    'Bienvenido',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1E99D3),
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Inicia sesión para continuar',
                    style: TextStyle(fontSize: 16, color: Colors.grey[600]),
                  ),
                  SizedBox(height: 30),
                  // Email Input
                  _buildAnimatedInput(
                    controller: _emailController,
                    label: 'Correo electrónico',
                    icon: Icons.person_outline,
                  ),
                  SizedBox(height: 20),
                  // Password Input
                  _buildAnimatedInput(
                    controller: _passwordController,
                    label: 'Contraseña',
                    icon: Icons.lock_outline,
                    obscure: true,
                  ),
                  SizedBox(height: 30),
                  // Botón "Ingresar"
                  AnimatedContainer(
                    duration: Duration(milliseconds: 400),
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _login,
                      style: ElevatedButton.styleFrom(
                        elevation: 8,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16.0),
                        ),
                        padding: EdgeInsets.zero,
                        backgroundColor: Colors.transparent,
                      ),
                      child: Ink(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [Color(0xFFec4899), Color(0xFF8b5cf6)],
                          ),
                          borderRadius: BorderRadius.circular(16.0),
                        ),
                        child: Container(
                          alignment: Alignment.center,
                          child: _isLoading
                              ? CircularProgressIndicator(color: Colors.white)
                              : Text(
                                  'Ingresar',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                        ),
                      ),
                    ),
                  ),
                  // Botón biométrico debajo
                  SizedBox(height: 10),
                  TextButton.icon(
                    onPressed: _loginWithBiometrics,
                    icon: Icon(Icons.fingerprint, color: Colors.grey[700]),
                    label: Text(
                      "Ingresar con biometría",
                      style: TextStyle(color: Colors.grey[700]),
                    ),
                  ),
                  SizedBox(height: 35),
                  // Redes sociales
                  Text(
                    'Visítanos',
                    style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                  ),
                  SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      IconButton(
                        icon: Icon(FontAwesomeIcons.facebook, color: Colors.blue),
                        onPressed: () async {
                          final Uri url = Uri.parse('https://www.facebook.com/share/194HAjyF3u/?mibextid=wwXIfr');
                          if (await canLaunchUrl(url)) await launchUrl(url);
                        },
                      ),
                      IconButton(
                        icon: Icon(FontAwesomeIcons.tiktok, color: Colors.black),
                        onPressed: () async {
                          final Uri url = Uri.parse('https://www.tiktok.com/@cerceta.solucion?_t=ZS-8v2GfV6wzLE&_r=1');
                          if (await canLaunchUrl(url)) await launchUrl(url);
                        },
                      ),
                      IconButton(
                        icon: Icon(Icons.language, color: Colors.green),
                        onPressed: () async {
                          final Uri url = Uri.parse('https://cercetasolucionesempresariales.com');
                          if (await canLaunchUrl(url)) await launchUrl(url);
                        },
                      ),
                    ],
                  ),
                  SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text("¿No tienes cuenta?", style: TextStyle(color: Colors.grey[600])),
                      TextButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (context) => RegisterScreen()),
                          );
                        },
                        child: Text("Registrarme", style: TextStyle(color: Colors.pinkAccent)),
                      ),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      Text("¿No puedes ingresar?", style: TextStyle(color: Colors.grey[600])),
                      TextButton(
                        onPressed: () {},
                        child: Text('Ayuda', style: TextStyle(color: Colors.pinkAccent)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Widget _buildAnimatedInput({
  required TextEditingController controller,
  required String label,
  required IconData icon,
  bool obscure = false,
}) {
  return AnimatedContainer(
    duration: Duration(milliseconds: 400),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14.0),
      boxShadow: [
        BoxShadow(
          color: Colors.black12,
          blurRadius: 12,
          offset: Offset(0, 5),
        ),
      ],
    ),
    child: TextField(
      controller: controller,
      obscureText: obscure,
      decoration: InputDecoration(
        prefixIcon: Icon(icon, color: Colors.pinkAccent),
        labelText: label,
        labelStyle: TextStyle(color: Colors.grey[700]),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14.0),
          borderSide: BorderSide.none,
        ),
        filled: true,
        fillColor: Colors.white,
        contentPadding: EdgeInsets.symmetric(vertical: 18, horizontal: 16),
      ),
    ),
  );
}
