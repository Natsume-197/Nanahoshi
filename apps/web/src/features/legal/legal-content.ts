/**
 * The base Terms and Privacy Policy every Nanahoshi server ships with. On a
 * self-hosted server the person who runs it is the one responsible, so the
 * text speaks of "the administrator of this server". An admin can point
 * TERMS_URL / PRIVACY_URL at their own documents instead.
 *
 * Japanese falls back to English until a reviewed translation exists.
 */
export type LegalDoc = {
	title: string;
	updated: string;
	intro: string;
	sections: { heading: string; body: string[] }[];
};

export type LegalKind = "terms" | "privacy";

const UPDATED = { es: "1 de octubre de 2026", en: "October 1, 2026" };

const es: Record<LegalKind, LegalDoc> = {
	terms: {
		title: "Términos del servicio",
		updated: UPDATED.es,
		intro:
			"Este servidor de Nanahoshi lo administra una persona u organización independiente (el «administrador»). Nanahoshi es el software que usa; no opera este servidor. Al crear una cuenta o iniciar sesión aceptas estos términos.",
		sections: [
			{
				heading: "Tu cuenta",
				body: [
					"Eres responsable de lo que se haga con tu cuenta y de mantener tu contraseña en secreto.",
					"El administrador decide quién puede registrarse y puede suspender o eliminar cuentas que incumplan estos términos.",
				],
			},
			{
				heading: "Lo que subes",
				body: [
					"Solo sube libros, audiolibros e imágenes que tengas derecho a guardar y, si los compartes, a compartir. Sigues siendo responsable de ese contenido.",
					"No subas contenido ilegal ni que infrinja derechos de otras personas. El administrador puede retirar cualquier contenido.",
				],
			},
			{
				heading: "Uso aceptable",
				body: [
					"No intentes acceder a cuentas, bibliotecas o datos que no te pertenecen, ni sobrecargar o dañar el servidor.",
					"Respeta a las demás personas del servidor en perfiles, colecciones públicas y cualquier otro espacio compartido.",
				],
			},
			{
				heading: "Disponibilidad y garantía",
				body: [
					"El servicio se ofrece «tal cual», sin garantía de disponibilidad continua ni de conservación de los datos. Guarda copia de lo que no quieras perder.",
					"En la medida en que la ley lo permita, ni el administrador ni los autores de Nanahoshi responden por daños derivados del uso del servicio.",
				],
			},
			{
				heading: "Cambios y contacto",
				body: [
					"El administrador puede actualizar estos términos; la fecha de arriba indica la última versión. Seguir usando el servicio implica aceptarla.",
					"Para cualquier duda, contacta con el administrador de este servidor.",
				],
			},
		],
	},
	privacy: {
		title: "Política de privacidad",
		updated: UPDATED.es,
		intro:
			"El administrador de este servidor es el responsable de los datos que guarda. Nanahoshi no recibe tus datos: todo se almacena en este servidor.",
		sections: [
			{
				heading: "Qué datos se guardan",
				body: [
					"Cuenta: nombre, nombre de usuario, correo, contraseña (cifrada) e imágenes de perfil.",
					"Si inicias sesión con Discord o Google: el identificador, el correo, el nombre y la imagen de esa cuenta.",
					"Actividad: progreso de lectura y escucha, sesiones de lectura, estanterías, favoritos, colecciones, notificaciones y preferencias.",
					"Archivos: los libros, audiolibros e imágenes que subes.",
					"Datos técnicos: la dirección IP y el navegador o dispositivo de cada sesión, y un registro de eventos de seguridad, para proteger tu cuenta.",
				],
			},
			{
				heading: "Para qué se usan",
				body: [
					"Para ofrecerte el servicio: tu biblioteca, sincronizar tu progreso entre dispositivos y generar recomendaciones dentro del propio servidor.",
					"Para la seguridad: detectar accesos sospechosos y limitar intentos de inicio de sesión.",
					"No se venden ni se usan para publicidad.",
				],
			},
			{
				heading: "Con quién se comparten",
				body: [
					"El administrador del servidor puede acceder a todos los datos que guarda.",
					"Con otras personas de este servidor, solo lo que eliges mostrar (por ejemplo, tu actividad de lectura o tus colecciones públicas).",
					"Servicios de metadatos (como Google Books, Open Library o Amazon) reciben títulos e ISBN de los libros para buscar portadas y datos; no reciben información sobre ti.",
					"Si usas Discord o Google para entrar, ese servicio sabe que iniciaste sesión aquí.",
					"Si el administrador activa la analítica de uso (PostHog) o el envío a Kindle por correo, esos servicios procesan los datos necesarios para funcionar.",
				],
			},
			{
				heading: "Cookies y almacenamiento",
				body: [
					"Se usan cookies y almacenamiento local imprescindibles para mantener tu sesión y tus preferencias. No hay cookies publicitarias.",
				],
			},
			{
				heading: "Cuánto tiempo y tus derechos",
				body: [
					"Los datos se conservan mientras tu cuenta exista. Puedes pedir al administrador ver, corregir, exportar o eliminar tus datos y tu cuenta.",
					"El servicio no está dirigido a menores de 13 años.",
				],
			},
			{
				heading: "Cambios y contacto",
				body: [
					"Esta política puede actualizarse; la fecha de arriba indica la última versión.",
					"Para ejercer tus derechos o resolver dudas, contacta con el administrador de este servidor.",
				],
			},
		],
	},
};

const en: Record<LegalKind, LegalDoc> = {
	terms: {
		title: "Terms of Service",
		updated: UPDATED.en,
		intro:
			"This Nanahoshi server is run by an independent person or organization (the “administrator”). Nanahoshi is the software it uses; it does not operate this server. By creating an account or signing in you agree to these terms.",
		sections: [
			{
				heading: "Your account",
				body: [
					"You're responsible for what happens with your account and for keeping your password secret.",
					"The administrator decides who can register and may suspend or delete accounts that break these terms.",
				],
			},
			{
				heading: "What you upload",
				body: [
					"Only upload books, audiobooks, and images you have the right to store and, if you share them, to share. You remain responsible for that content.",
					"Don't upload illegal content or anything that infringes other people's rights. The administrator may remove any content.",
				],
			},
			{
				heading: "Acceptable use",
				body: [
					"Don't try to access accounts, libraries, or data that aren't yours, or to overload or harm the server.",
					"Be respectful to other people on the server in profiles, public collections, and any other shared space.",
				],
			},
			{
				heading: "Availability and warranty",
				body: [
					"The service is provided “as is”, with no guarantee that it will always be available or that data will be kept. Keep a copy of anything you don't want to lose.",
					"To the extent the law allows, neither the administrator nor the authors of Nanahoshi are liable for damages arising from use of the service.",
				],
			},
			{
				heading: "Changes and contact",
				body: [
					"The administrator may update these terms; the date above shows the latest version. Continuing to use the service means accepting it.",
					"For any questions, contact the administrator of this server.",
				],
			},
		],
	},
	privacy: {
		title: "Privacy Policy",
		updated: UPDATED.en,
		intro:
			"The administrator of this server is responsible for the data it stores. Nanahoshi doesn't receive your data: everything is stored on this server.",
		sections: [
			{
				heading: "What's stored",
				body: [
					"Account: name, username, email, password (hashed), and profile images.",
					"If you sign in with Discord or Google: that account's ID, email, name, and image.",
					"Activity: reading and listening progress, reading sessions, shelves, likes, collections, notifications, and preferences.",
					"Files: the books, audiobooks, and images you upload.",
					"Technical data: the IP address and browser or device of each session, and a log of security events, to protect your account.",
				],
			},
			{
				heading: "What it's used for",
				body: [
					"To provide the service: your library, syncing your progress across devices, and recommendations computed on the server itself.",
					"For security: spotting suspicious access and limiting sign-in attempts.",
					"It isn't sold or used for advertising.",
				],
			},
			{
				heading: "Who it's shared with",
				body: [
					"The server's administrator can access all the data it stores.",
					"Other people on this server see only what you choose to show (for example, your reading activity or public collections).",
					"Metadata services (such as Google Books, Open Library, or Amazon) receive book titles and ISBNs to find covers and details; they receive nothing about you.",
					"If you sign in with Discord or Google, that service knows you signed in here.",
					"If the administrator turns on usage analytics (PostHog) or Send to Kindle by email, those services process the data they need to work.",
				],
			},
			{
				heading: "Cookies and storage",
				body: [
					"Essential cookies and local storage keep you signed in and remember your preferences. There are no advertising cookies.",
				],
			},
			{
				heading: "Retention and your rights",
				body: [
					"Data is kept while your account exists. You can ask the administrator to see, correct, export, or delete your data and your account.",
					"The service isn't directed at children under 13.",
				],
			},
			{
				heading: "Changes and contact",
				body: [
					"This policy may be updated; the date above shows the latest version.",
					"To exercise your rights or ask questions, contact the administrator of this server.",
				],
			},
		],
	},
};

export function legalDoc(kind: LegalKind, locale: string): LegalDoc {
	return (locale === "es" ? es : en)[kind];
}
