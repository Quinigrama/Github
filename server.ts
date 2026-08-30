import express from "express";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Universal CORS Middleware - Must execute FIRST before any body parsers or routes
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE, HEAD");
    
    // Echo back requested headers or provide a comprehensive permissive set
    const reqHeaders = req.headers["access-control-request-headers"];
    if (reqHeaders) {
      res.setHeader("Access-Control-Allow-Headers", reqHeaders);
    } else {
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma, Access-Control-Request-Method, Access-Control-Request-Headers");
    }
    
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin, Access-Control-Request-Headers, Access-Control-Request-Method");

    // Fast-path for CORS preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });

  // Explicit OPTIONS fallback handler
  app.options("*", (req, res) => {
    res.status(204).end();
  });

  // 2. Body Parsers (supporting JSON, text/plain, and urlencoded)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ type: ['text/plain', 'text/*', 'application/text'], limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Normalize body if sent as text string
  app.use((req, res, next) => {
    if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        // Not valid JSON string, leave as is
      }
    }
    next();
  });

  // API Routes
  app.post("/api/contact", async (req, res) => {
    const { message, email } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: "El mensaje es obligatorio." });
    }

    // Buscar variables de entorno de forma insensible a mayúsculas/minúsculas
    const getEnv = (name: string) => {
      const key = Object.keys(process.env).find(k => k.toUpperCase() === name.toUpperCase());
      return key ? process.env[key] : null;
    };

    const isPlaceholder = (val: string | null | undefined) => {
      if (!val) return true;
      const lower = val.toLowerCase();
      return lower.includes("tu-") || lower.includes("example") || lower.includes("placeholder") || lower.trim() === "";
    };

    const emailUser = getEnv("EMAIL_USER");
    const emailPass = getEnv("EMAIL_PASS");

    if (!emailUser || !emailPass || isPlaceholder(emailUser) || isPlaceholder(emailPass)) {
      console.error("Falta configurar EMAIL_USER y/o EMAIL_PASS.");
      return res.status(500).json({ 
        error: "El servidor de correo no está configurado. Por favor, configura EMAIL_USER (tu correo Gmail) y EMAIL_PASS (Contraseña de Aplicación de Google) en los secretos de la aplicación." 
      });
    }

    try {
      // Limpiar espacios en blanco (incluyendo espacios internos en contraseñas de aplicación tipo 'abcd efgh ijkl mnop')
      const cleanedUser = emailUser.trim();
      const cleanedPass = emailPass.trim().replace(/\s+/g, '');

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: cleanedUser,
          pass: cleanedPass
        }
      });

      const userEmail = email && typeof email === 'string' && email.trim() ? email.trim() : "Anónimo / No especificado";

      await transporter.sendMail({
        from: `"DataLotto Contacto" <${cleanedUser}>`,
        to: "datalotto49@gmail.com",
        subject: "📬 Nuevo mensaje de contacto - DataLotto",
        text: `Nuevo mensaje recibido desde DataLotto:\n\nMensaje:\n${message}\n\nEmail del remitente: ${userEmail}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">📬 Nuevo mensaje de contacto - DataLotto</h2>
            <p style="font-size: 1rem; color: #475569;"><strong>Mensaje:</strong></p>
            <blockquote style="background: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0; border-radius: 4px; font-size: 0.95rem; line-height: 1.5; color: #1e293b;">
              ${String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>')}
            </blockquote>
            <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 0;"><strong>Email del remitente:</strong> ${userEmail}</p>
          </div>
        `
      });

      return res.json({ success: true, message: "Mensaje enviado correctamente." });
    } catch (error: any) {
      console.error("Error enviando correo vía Nodemailer SMTP:", error);
      let errMsg = error?.message || "Error interno de servidor";
      if (errMsg.includes("535") || errMsg.includes("BadCredentials") || errMsg.includes("Username and Password not accepted")) {
        errMsg = "Google ha rechazado las credenciales (535 Bad Credentials). Asegúrate de utilizar la Contraseña de Aplicación de 16 letras (sin usar tu contraseña habitual de Gmail) y tener activada la Verificación en 2 Pasos en tu cuenta de Google.";
      }
      return res.status(500).json({
        error: `Error al enviar el correo: ${errMsg}`
      });
    }
  });

  app.post("/api/telemetry", async (req, res) => {
    try {
      const { event, gameId, payload, timestamp } = req.body;

      console.log(`[Telemetry] Event: ${event}, Game: ${gameId}`, payload);

      const getEnv = (name: string) => {
        const key = Object.keys(process.env).find(k => k.toUpperCase() === name.toUpperCase());
        return key ? process.env[key] : null;
      };

      const googleSheetsUrl = getEnv("GOOGLE_SHEETS_WEBAPP_URL");

      const isPlaceholder = (val: string | null | undefined) => {
        if (!val) return true;
        const lower = val.toLowerCase();
        return lower.includes("tu-") || lower.includes("example") || lower.includes("placeholder") || lower.trim() === "";
      };

      const hasGoogleSheets = googleSheetsUrl && !isPlaceholder(googleSheetsUrl);

      // 1. Send to Google Sheets if configured (anonymous telemetry)
      if (hasGoogleSheets) {
        let sheetsBody: any = { event };

        if (event === "save_ticket") {
          sheetsBody = {
            event: "save_ticket",
            gameId: gameId || payload.gameId || "bonoloto",
            combinationsCount: payload.combinationsCount ?? 1,
            betType: payload.betType || "simple",
            numbersCount: payload.numbersCount ?? 6,
            starsCount: payload.starsCount ?? 0,
            timestamp: timestamp || new Date().toISOString()
          };

          // Campos opcionales: solo se incluyen si vienen presentes en el payload,
          // para no ensuciar el body enviado a Sheets con "undefined" cuando no aplican.
          if (payload.favoriteNumbers && Array.isArray(payload.favoriteNumbers) && payload.favoriteNumbers.length > 0) {
            sheetsBody.favoriteNumbers = payload.favoriteNumbers;
          }
          if (payload.favoriteSecondaryNumbers && Array.isArray(payload.favoriteSecondaryNumbers) && payload.favoriteSecondaryNumbers.length > 0) {
            sheetsBody.favoriteSecondaryNumbers = payload.favoriteSecondaryNumbers;
          }
          if (payload.drawDate) {
            sheetsBody.drawDate = payload.drawDate;
          }
        } else if (event === "validate_ticket") {
          sheetsBody = {
            event: "validate_ticket",
            gameId: gameId || payload.gameId || "bonoloto",
            allHits: payload.allHits || [],
            starHits: payload.stars || [],
            combinationsCount: payload.combinationsCount || (payload.allHits ? payload.allHits.length : 1),
            timestamp: timestamp || new Date().toISOString()
          };
          if (payload.favoriteNumbers && Array.isArray(payload.favoriteNumbers) && payload.favoriteNumbers.length > 0) {
            sheetsBody.favoriteNumbers = payload.favoriteNumbers;
          }
          if (payload.favoriteSecondaryNumbers && Array.isArray(payload.favoriteSecondaryNumbers) && payload.favoriteSecondaryNumbers.length > 0) {
            sheetsBody.favoriteSecondaryNumbers = payload.favoriteSecondaryNumbers;
          }
          if (payload.favoriteCounts) {
            sheetsBody.favoriteCounts = payload.favoriteCounts;
          }
          if (payload.favoriteSecondaryCounts) {
            sheetsBody.favoriteSecondaryCounts = payload.favoriteSecondaryCounts;
          }
          if (payload.controlHits && Array.isArray(payload.controlHits) && payload.controlHits.length > 0) {
            sheetsBody.controlHits = payload.controlHits;
          }
          if (payload.controlStarHits && Array.isArray(payload.controlStarHits) && payload.controlStarHits.length > 0) {
            sheetsBody.controlStarHits = payload.controlStarHits;
          }
        } else {
          sheetsBody = {
            event,
            gameId: gameId || payload.gameId,
            ...payload,
            timestamp: timestamp || new Date().toISOString()
          };
        }

        await fetch(googleSheetsUrl!.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sheetsBody)
        }).catch(err => console.error("Error sending telemetry to Google Sheets:", err));
      }

      // Los avisos de premio importante ahora se envían directamente desde el cliente vía Telegram (ver sendTelegramPrizeAlert en index.tsx).

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error logging telemetry:", error);
      res.status(500).json({ error: error.message || "Error logging telemetry" });
    }
  });

  app.all("/api/jackpots", async (req, res) => {
    const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRcKUCZOa3NM7dBYXOzWO94y51x6RFT6jUCrTYpoLBlKAztGTbbxnygcC8pg47RScEMuVquZOX8iLCt/pub?output=csv";
    
    // Fallback data helper
    const getNextDrawDateStr = (gameId: string): string => {
      const now = new Date();
      const day = now.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
      let daysToAdd = 1;
      
      if (gameId === 'bonoloto') {
        daysToAdd = 1;
      } else if (gameId === 'primitiva') {
        if (day < 4) daysToAdd = 4 - day;
        else if (day < 6) daysToAdd = 6 - day;
        else daysToAdd = 4;
      } else if (gameId === 'gordo') {
        if (day === 0) daysToAdd = 7;
        else daysToAdd = 7 - day;
      } else if (gameId === 'euromillones' || gameId === 'megamillions') {
        if (day < 2) daysToAdd = 2 - day;
        else if (day < 5) daysToAdd = 5 - day;
        else daysToAdd = 7 - day + 2;
      } else if (gameId === 'eurodreams') {
        if (day < 1) daysToAdd = 1 - day;
        else if (day < 4) daysToAdd = 4 - day;
        else daysToAdd = 1;
      } else {
        if (day < 4) daysToAdd = 4 - day;
        else if (day < 6) daysToAdd = 6 - day;
        else daysToAdd = 4;
      }
      
      const targetDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      return targetDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const fallbackJackpots = [
      { id: "powerball", juego: "Powerball (EE. UU.)", bote: 95000000, fecha: getNextDrawDateStr("powerball") },
      { id: "megamillions", juego: "Mega Millions (EE. UU.)", bote: 95000000, fecha: getNextDrawDateStr("megamillions") },
      { id: "euromillones", juego: "EuroMillones", bote: 89000000, fecha: getNextDrawDateStr("euromillones") },
      { id: "primitiva", juego: "La Primitiva", bote: 47000000, fecha: getNextDrawDateStr("primitiva") },
      { id: "gordo", juego: "El Gordo de la Primitiva", bote: 11900000, fecha: getNextDrawDateStr("gordo") },
      { id: "eurodreams", juego: "EuroDreams", bote: 7200000, fecha: getNextDrawDateStr("eurodreams") },
      { id: "bonoloto", juego: "BonoLoto", bote: 2800000, fecha: getNextDrawDateStr("bonoloto") },
      { id: "nacional", juego: "Lotería Nacional", bote: 30000, fecha: getNextDrawDateStr("nacional") }
    ];

    try {
      console.log(`[Jackpots] Fetching published sheet from: ${csvUrl}`);
      const response = await fetch(csvUrl, {
        method: "GET",
        headers: { "Accept": "text/csv; charset=utf-8" }
      });
      
      if (!response.ok) {
        throw new Error(`Google Sheets HTTP error: ${response.status} ${response.statusText}`);
      }

      const csvText = await response.text();
      
      if (!csvText || csvText.trim().startsWith("<!DOCTYPE")) {
        throw new Error("Returned HTML instead of CSV data");
      }

      // Simple CSV parser
      const parseCSV = (text: string): string[][] => {
        const lines: string[][] = [];
        let row: string[] = [];
        let cell = '';
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const nextChar = text[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              cell += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            row.push(cell.trim());
            cell = '';
          } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
            row.push(cell.trim());
            if (row.length > 0 && row.some(c => c !== '')) {
              lines.push(row);
            }
            row = [];
            cell = '';
          } else {
            cell += char;
          }
        }
        if (cell || row.length > 0) {
          row.push(cell.trim());
          lines.push(row);
        }
        return lines;
      };

      const parseBote = (boteStr: string): number => {
        if (!boteStr) return 0;
        const lower = boteStr.toLowerCase();
        if (lower.includes("no disponible") || lower.includes("consultar")) return 0;
        
        let multiplier = 1;
        if (lower.includes("billion") || lower.includes("billon") || lower.includes("billón")) {
          multiplier = 1000000000;
        } else if (lower.includes("million") || lower.includes("millon") || lower.includes("millón")) {
          multiplier = 1000000;
        }

        const cleanStr = lower.replace(/[^0-9,.]/g, "");
        if (!cleanStr) return 0;

        let num = 0;
        if (multiplier > 1) {
          const cleanNum = cleanStr.replace(',', '.');
          num = parseFloat(cleanNum) * multiplier;
        } else {
          const parts = cleanStr.split(',');
          const integerPart = parts[0].replace(/\./g, "");
          num = parseInt(integerPart, 10);
        }
        return isNaN(num) ? 0 : num;
      };

      const rows = parseCSV(csvText);
      if (rows.length <= 1) {
        throw new Error("CSV has no data rows");
      }

      const parsedData: any[] = [];
      const header = rows[0].map(h => h.toLowerCase().trim());
      
      const gameIdx = header.indexOf("juego");
      // Find index of column matching 'fecha próximo sorteo' or 'fecha'
      let dateIdx = header.findIndex(h => h.includes("fecha") || h.includes("sorteo"));
      if (dateIdx === -1) dateIdx = 1;
      
      // Find index of column matching 'bote' or 'acumulado'
      let jackpotIdx = header.findIndex(h => h.includes("bote") || h.includes("acumulado"));
      if (jackpotIdx === -1) jackpotIdx = 2;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue;
        
        const juego = row[gameIdx] || "";
        const fecha = row[dateIdx] || "";
        const boteRaw = row[jackpotIdx] || "";
        
        const lowerName = juego.toLowerCase();
        let id = "";
        
        if (lowerName.includes("powerball") || (lowerName.includes("power") && lowerName.includes("ball"))) {
          id = "powerball";
        } else if (lowerName.includes("mega") || lowerName.includes("megamillions")) {
          id = "megamillions";
        } else if (lowerName.includes("euromillones") || (lowerName.includes("euro") && lowerName.includes("mill"))) {
          id = "euromillones";
        } else if (lowerName.includes("primitiva") && !lowerName.includes("gordo")) {
          id = "primitiva";
        } else if (lowerName.includes("gordo")) {
          id = "gordo";
        } else if (lowerName.includes("bonoloto")) {
          id = "bonoloto";
        } else if (lowerName.includes("eurodreams") || (lowerName.includes("euro") && lowerName.includes("dream"))) {
          id = "eurodreams";
        } else if (lowerName.includes("nacional")) {
          id = "nacional";
        }
        
        if (id) {
          const bote = parseBote(boteRaw);
          parsedData.push({
            id,
            juego,
            bote,
            fecha: fecha || getNextDrawDateStr(id)
          });
        }
      }

      // Ensure all supported games are present, falling back to defaults if missing or empty
      const supportedGameIds = ["powerball", "megamillions", "euromillones", "primitiva", "gordo", "eurodreams", "bonoloto", "nacional"];
      const finalData: any[] = [];

      supportedGameIds.forEach(gameId => {
        const found = parsedData.find(item => item.id === gameId);
        if (found) {
          let bote = found.bote;
          if (gameId === "nacional" && bote === 0) {
            bote = 30000;
          }
          if (gameId === "eurodreams" && bote === 0) {
            bote = 7200000;
          }
          finalData.push({
            ...found,
            bote
          });
        } else {
          const fb = fallbackJackpots.find(item => item.id === gameId);
          if (fb) {
            finalData.push(fb);
          }
        }
      });

      return res.json({
        success: true,
        isFallback: false,
        data: finalData
      });

    } catch (error: any) {
      console.error("[Jackpots] Error fetching/parsing jackpots, serving fallback:", error);
      return res.json({
        success: true,
        isFallback: true,
        errorDetail: error.message || "Error al conectar o parsear la hoja de cálculo.",
        data: fallbackJackpots
      });
    }
  });

  // Unmatched API route handler (return JSON 404 instead of HTML SPA)
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Ruta API no encontrada: ${req.method} ${req.path}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
