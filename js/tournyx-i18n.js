/**
 * Tournyx Esports — Universal All-India + Combo Whole-App Language Engine (v9.1)
 * 24 Languages: English + 9 Indian-English Combos (Tanglish, Hinglish, Tenglish,
 * Manglish, Kanglish, Bonglish, Marathlish, Gujlish, Punglish) + 14 Official Indian Scripts.
 * Stored strictly on-device (localStorage) — zero DB writes, bundled in native app assets.
 */
(() => {
  "use strict";

  const LANG_KEY = "tournyx_lang";
  const PACK_PREFIX = "tournyx_i18n_pack_v91_";

  const LANGUAGES = [
    // English Default
    { code: "en", name: "English (India)", native: "English", group: "default", script: "en", dir: "ltr" },

    // Popular Indian-English Gamer Combos (Instant Offline Packs!)
    { code: "ta-en", name: "Tanglish", native: "Tamil + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "hi-en", name: "Hinglish", native: "Hindi + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "te-en", name: "Tenglish", native: "Telugu + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "ml-en", name: "Manglish", native: "Malayalam + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "kn-en", name: "Kanglish", native: "Kannada + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "bn-en", name: "Bonglish", native: "Bengali + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "mr-en", name: "Marathlish", native: "Marathi + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "gu-en", name: "Gujlish", native: "Gujarati + English", group: "combo", script: "combo", dir: "ltr" },
    { code: "pa-en", name: "Punglish", native: "Punjabi + English", group: "combo", script: "combo", dir: "ltr" },

    // All Major Official Indian Languages (Offline Core + Auto-Cached Full Pack)
    { code: "hi", name: "Hindi", native: "हिन्दी", group: "indian", script: "hi", dir: "ltr" },
    { code: "ta", name: "Tamil", native: "தமிழ்", group: "indian", script: "ta", dir: "ltr" },
    { code: "te", name: "Telugu", native: "తెలుగు", group: "indian", script: "te", dir: "ltr" },
    { code: "ml", name: "Malayalam", native: "മലയാളം", group: "indian", script: "ml", dir: "ltr" },
    { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", group: "indian", script: "kn", dir: "ltr" },
    { code: "mr", name: "Marathi", native: "मराठी", group: "indian", script: "mr", dir: "ltr" },
    { code: "bn", name: "Bengali", native: "বাংলা", group: "indian", script: "bn", dir: "ltr" },
    { code: "gu", name: "Gujarati", native: "ગુજરાતી", group: "indian", script: "gu", dir: "ltr" },
    { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", group: "indian", script: "pa", dir: "ltr" },
    { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", group: "indian", script: "or", dir: "ltr" },
    { code: "as", name: "Assamese", native: "অসমীয়া", group: "indian", script: "as", dir: "ltr" },
    { code: "ur", name: "Urdu", native: "اردو", group: "indian", script: "ur", dir: "rtl" },
    { code: "ne", name: "Nepali", native: "नेपाली", group: "indian", script: "ne", dir: "ltr" },
    { code: "sa", name: "Sanskrit", native: "संस्कृतम्", group: "indian", script: "sa", dir: "ltr" }
  ];

  // Bundled Zero-Latency Offline Phrasebooks (Lowercase Normalized English -> Localized Phrase)
  // Ships inside Android/iOS/Desktop/PWA assets so core app UI translates in < 2ms offline!
  const BUILTIN = {
    "ta-en": {
      "login": "Login Pannu",
      "organizer": "Organizer",
      "create id": "Pudhu ID",
      "help": "Help",
      "lang": "Mozhi",
      "accounts": "Accounts",
      "home": "Home",
      "home feed": "Home Feed",
      "explore": "Explore",
      "explore cups": "Cups Paaru",
      "matches": "Matches",
      "my matches": "En Matches",
      "reels": "Reels",
      "clutch reels": "Clutch Reels",
      "clans": "Clans",
      "clans & voice": "Clans & Voice",
      "profile": "Profile",
      "settings": "Settings",
      "support": "Support",
      "messages": "Messages",
      "notifications": "Alerts",
      "enter battleground": "Arena-kku Vaanga",
      "entering the arena": "ARENA-KKU ULLA POGUDHU",
      "player identifier / email": "Email / IGN / Phone Podunga",
      "password": "Password",
      "forgot password?": "Password Marandhucha?",
      "or authenticate via": "Illana Idhu Vazhiya Login",
      "new to tournyx?": "Tournyx-ku Pudhusa?",
      "create free player id": "Free Player ID Create Pannu",
      "create free player id →": "Free Player ID Create Pannu →",
      "resume": "Direct Login",
      "logout": "Logout",
      "saved agent profiles": "Save Aana Accounts",
      "select arena language": "Ungal Mozhi Select Pannunga",
      "open lobbies": "Open Lobbies",
      "suggested reels & highlights": "Trending Reels & Clutches",
      "esports arena feed": "Esports Arena Feed",
      "my clans": "En Clans",
      "find": "Thedu",
      "ranks": "Ranks",
      "inbox": "Inbox",
      "create clan": "Pudhu Clan",
      "voice room": "Voice Room",
      "chat": "Chat",
      "ready check": "Ready Check",
      "recruit": "Recruit",
      "daily check-in": "Daily Check-In",
      "claim today": "Innaiku Claim Pannu",
      "complete & enter arena": "Finish Panni Arena-kku Po",
      "verify & launch studio": "Verify Panni Studio Open Pannu",
      "next": "Next →",
      "skip": "Skip Pannu",
      "back": "Back",
      "submit ticket": "Ticket Anuppu",
      "track ticket": "Ticket Track Pannu",
      "enable location": "Location On Pannu",
      "send otp": "OTP Anuppu",
      "verify otp": "OTP Verify Pannu",
      "view all": "Ellam Paaru",
      "post clip": "Clip Podu",
      "find & chat": "Players Thedu"
    },
    "hi-en": {
      "login": "Login Karo",
      "organizer": "Organizer",
      "create id": "Naya ID",
      "help": "Madad",
      "lang": "Bhasha",
      "accounts": "Accounts",
      "home": "Home",
      "home feed": "Home Feed",
      "explore": "Explore",
      "explore cups": "Cups Dekho",
      "matches": "Matches",
      "my matches": "Mere Matches",
      "reels": "Reels",
      "clutch reels": "Clutch Reels",
      "clans": "Clans",
      "clans & voice": "Clans & Voice",
      "profile": "Profile",
      "settings": "Settings",
      "support": "Support",
      "messages": "Messages",
      "notifications": "Alerts",
      "enter battleground": "Arena Mein Utro",
      "entering the arena": "ARENA MEIN ENTRY HO RAHI HAI",
      "player identifier / email": "Email / IGN / Phone Daalo",
      "password": "Password",
      "forgot password?": "Password Bhool Gaye?",
      "or authenticate via": "Ya Isse Login Karo",
      "new to tournyx?": "Tournyx Pe Naye Ho?",
      "create free player id": "Free Player ID Banao",
      "create free player id →": "Free Player ID Banao →",
      "resume": "Direct Login",
      "logout": "Logout",
      "saved agent profiles": "Saved Accounts",
      "select arena language": "Apni Language Chuno",
      "open lobbies": "Open Lobbies",
      "suggested reels & highlights": "Trending Reels & Clutches",
      "esports arena feed": "Esports Arena Feed",
      "my clans": "Mere Clans",
      "find": "Khojo",
      "ranks": "Ranks",
      "inbox": "Inbox",
      "create clan": "Naya Clan",
      "voice room": "Voice Room",
      "chat": "Chat",
      "ready check": "Ready Check",
      "recruit": "Recruit",
      "daily check-in": "Daily Check-In",
      "claim today": "Aaj Claim Karo",
      "complete & enter arena": "Complete Karke Arena Jao",
      "verify & launch studio": "Verify Karke Studio Kholo",
      "next": "Aage Badho →",
      "skip": "Skip Karo",
      "back": "Peeche",
      "submit ticket": "Ticket Bhejo",
      "track ticket": "Ticket Track Karo",
      "enable location": "Location On Karo",
      "send otp": "OTP Bhejo",
      "verify otp": "OTP Verify Karo",
      "view all": "Sab Dekho",
      "post clip": "Clip Daalo",
      "find & chat": "Players Khojo"
    },
    "te-en": {
      "login": "Login Chey",
      "organizer": "Organizer",
      "create id": "Kotha ID",
      "help": "Help",
      "lang": "Bhasha",
      "accounts": "Accounts",
      "home": "Home",
      "explore": "Explore",
      "matches": "Matches",
      "reels": "Reels",
      "clans": "Clans",
      "profile": "Profile",
      "enter battleground": "Arena Loki Ra",
      "entering the arena": "ARENA LOKI ENTRY AVUTHONDI",
      "player identifier / email": "Email / IGN / Phone Ivvandi",
      "forgot password?": "Password Marchipoyara?",
      "new to tournyx?": "Tournyx Ki Kotha Na?",
      "create free player id →": "Free Player ID Create Chey →",
      "resume": "Direct Login",
      "logout": "Logout",
      "next": "Next →",
      "skip": "Skip Chey",
      "enable location": "Location On Chey",
      "complete & enter arena": "Finish Chesi Arena Loki Po",
      "submit ticket": "Ticket Pampu",
      "track ticket": "Ticket Track Chey"
    },
    "ml-en": {
      "login": "Login Cheyyu",
      "organizer": "Organizer",
      "create id": "Puthiya ID",
      "help": "Help",
      "lang": "Bhasha",
      "accounts": "Accounts",
      "home": "Home",
      "explore": "Explore",
      "matches": "Matches",
      "reels": "Reels",
      "clans": "Clans",
      "profile": "Profile",
      "enter battleground": "Arena-yil Keru",
      "entering the arena": "ARENA-YIL KERUNNU",
      "player identifier / email": "Email / IGN / Phone Adikku",
      "forgot password?": "Password Maranno?",
      "new to tournyx?": "Tournyx-il Puthiyathano?",
      "create free player id →": "Free Player ID Undakku →",
      "resume": "Direct Login",
      "logout": "Logout",
      "next": "Aduthath →",
      "skip": "Skip Cheyyu",
      "enable location": "Location On Aakku",
      "complete & enter arena": "Complete Aakki Arena Pokam"
    },
    "kn-en": {
      "login": "Login Maadi",
      "organizer": "Organizer",
      "create id": "Hosa ID",
      "help": "Help",
      "lang": "Bhashe",
      "accounts": "Accounts",
      "home": "Home",
      "explore": "Explore",
      "matches": "Matches",
      "reels": "Reels",
      "clans": "Clans",
      "profile": "Profile",
      "enter battleground": "Arena Ge Banni",
      "entering the arena": "ARENA GE ENTRY AAGUTTIDE",
      "player identifier / email": "Email / IGN / Phone Haaki",
      "forgot password?": "Password Marethira?",
      "new to tournyx?": "Tournyx Ge Hosabara?",
      "create free player id →": "Free Player ID Maadi →",
      "resume": "Direct Login",
      "logout": "Logout",
      "next": "Munde →",
      "skip": "Skip Maadi",
      "enable location": "Location On Maadi"
    },
    "bn-en": {
      "login": "Login Koro",
      "create id": "Notun ID",
      "enter battleground": "Arena-te Namo",
      "entering the arena": "ARENA-TE ENTRY HOCHHE",
      "forgot password?": "Password Bhule Gecho?",
      "new to tournyx?": "Tournyx-e Notun?",
      "create free player id →": "Free Player ID Banao →",
      "resume": "Direct Login",
      "next": "Next →",
      "skip": "Skip Koro"
    },
    "mr-en": {
      "login": "Login Kara",
      "create id": "Navin ID",
      "enter battleground": "Arena Madhe Utra",
      "entering the arena": "ARENA MADHE ENTRY HOT AAHE",
      "forgot password?": "Password Visarlat Ka?",
      "new to tournyx?": "Tournyx Var Navin Aahat?",
      "create free player id →": "Free Player ID Banva →",
      "resume": "Direct Login",
      "next": "Pudhe →",
      "skip": "Skip Kara"
    },
    "gu-en": {
      "login": "Login Karo",
      "create id": "Navu ID",
      "enter battleground": "Arena Ma Aavo",
      "entering the arena": "ARENA MA ENTRY THAY CHE",
      "forgot password?": "Password Bhuli Gaya?",
      "new to tournyx?": "Tournyx Par Nava Cho?",
      "create free player id →": "Free Player ID Banavo →",
      "resume": "Direct Login",
      "next": "Aagal →",
      "skip": "Skip Karo"
    },
    "pa-en": {
      "login": "Login Karo",
      "create id": "Nava ID",
      "enter battleground": "Arena Vich Aao",
      "entering the arena": "ARENA VICH ENTRY HO RAHI HAI",
      "forgot password?": "Password Bhull Gaye?",
      "new to tournyx?": "Tournyx Te Nave Ho?",
      "create free player id →": "Free Player ID Banao →",
      "resume": "Direct Login",
      "next": "Agge →",
      "skip": "Skip Karo"
    },
    // Core Native Script Instant Seed Phrases (Full Page Auto-Downloads & Caches Automatically!)
    "hi": {
      "login": "लॉगिन", "organizer": "आयोजक", "create id": "नया खाता", "help": "सहायता", "lang": "भाषा", "accounts": "खाते",
      "home": "होम", "explore": "एक्सप्लोर", "matches": "मैच", "reels": "रील्स", "clans": "क्लैन", "profile": "प्रोफ़ाइल",
      "enter battleground": "मैदान में उतरें", "entering the arena": "एरीना में प्रवेश हो रहा है",
      "player identifier / email": "ईमेल / IGN / फ़ोन", "password": "पासवर्ड", "forgot password?": "पासवर्ड भूल गए?",
      "resume": "जारी रखें", "logout": "लॉगआउट", "next": "आगे बढ़ें →", "skip": "छोड़ें"
    },
    "ta": {
      "login": "உள்நுழை", "organizer": "அமைப்பாளர்", "create id": "புதிய கணக்கு", "help": "உதவி", "lang": "மொழி", "accounts": "கணக்குகள்",
      "home": "முகப்பு", "explore": "ஆராய்க", "matches": "போட்டிகள்", "reels": "ரீல்ஸ்", "clans": "கிளான்", "profile": "சுயவிவரம்",
      "enter battleground": "களத்தில் இறங்கு", "entering the arena": "போர்க்களத்தில் நுழைகிறது",
      "player identifier / email": "மின்னஞ்சல் / IGN / எண்", "password": "கடவுச்சொல்", "forgot password?": "கடவுச்சொல் மறந்ததா?",
      "resume": "தொடரவும்", "logout": "வெளியேறு", "next": "அடுத்து →", "skip": "தவிர்"
    },
    "te": {
      "login": "లాగిన్", "organizer": "ఆర్గనైజర్", "create id": "కొత్త ఖాతా", "help": "సహాయం", "lang": "భాష", "accounts": "ఖాతాలు",
      "home": "హోమ్", "explore": "ఎక్స్‌ప్లోర్", "matches": "మ్యాచ్‌లు", "reels": "రీల్స్", "clans": "క్లాన్స్", "profile": "ప్రొఫైల్",
      "enter battleground": "బరిలోకి దిగండి", "entering the arena": "అరేనాలోకి ప్రవేశిస్తోంది",
      "resume": "కొనసాగించు", "logout": "లాగ్ అవుట్", "next": "తదుపరి →", "skip": "దాటవేయి"
    },
    "ml": {
      "login": "ലോഗിൻ", "organizer": "ഓർഗനൈസർ", "create id": "പുതിയ അക്കൗണ്ട്", "help": "സഹായം", "lang": "ഭാഷ", "accounts": "അക്കൗണ്ടുകൾ",
      "home": "ഹോം", "explore": "എക്സ്പ്ലോർ", "matches": "മത്സരങ്ങൾ", "reels": "റീൽസ്", "clans": "ക്ലാൻസ്", "profile": "പ്രൊഫൈൽ",
      "enter battleground": "കളത്തിലിറങ്ങുക", "entering the arena": "അരീനയിലേക്ക് പ്രവേശിക്കുന്നു",
      "resume": "തുടരുക", "logout": "ലോഗൗട്ട്", "next": "അടുത്തത് →", "skip": "ഒഴിവാക്കുക"
    },
    "kn": {
      "login": "ಲಾಗಿನ್", "organizer": "ಆಯೋಜಕರು", "create id": "ಹೊಸ ಖಾತೆ", "help": "ಸಹಾಯ", "lang": "ಭಾಷೆ", "accounts": "ಖಾತೆಗಳು",
      "home": "ಹೋಮ್", "explore": "ಅನ್ವೇಷಿಸಿ", "matches": "ಪಂದ್ಯಗಳು", "reels": "ರೀಲ್ಸ್", "clans": "ಕ್ಲಾನ್ಸ್", "profile": "ಪ್ರೊಫೈಲ್",
      "enter battleground": "ಕಣಕ್ಕೆ ಇಳಿಯಿರಿ", "entering the arena": "ಅರೇನಾ ಪ್ರವೇಶಿಸಲಾಗುತ್ತಿದೆ",
      "resume": "ಮುಂದುವರಿಸಿ", "logout": "ಲಾಗ್ ಔಟ್", "next": "ಮುಂದೆ →", "skip": "ಬಿಟ್ಟುಬಿಡಿ"
    },
    "mr": {
      "login": "लॉगिन", "organizer": "आयोजक", "create id": "नवीन खाते", "help": "मदत", "lang": "भाषा", "accounts": "खाती",
      "home": "होम", "explore": "एक्सप्लोर", "matches": "सामने", "reels": "रील्स", "clans": "क्लॅन्स", "profile": "प्रोफाइल",
      "enter battleground": "मैदानात उतरा", "entering the arena": "अरेना मध्ये प्रवेश होत आहे",
      "resume": "सुरू ठेवा", "logout": "लॉगआउट", "next": "पुढे →", "skip": "वगळा"
    },
    "bn": {
      "login": "লগইন", "organizer": "অর্গানাইজার", "create id": "নতুন অ্যাকাউন্ট", "help": "সাহায্য", "lang": "ভাষা", "accounts": "অ্যাকাউন্ট",
      "home": "হোম", "explore": "এক্সপ্লোর", "matches": "ম্যাচ", "reels": "রিলস", "clans": "ক্ল্যান", "profile": "প্রোফাইল",
      "enter battleground": "এরিনায় প্রবেশ করুন", "resume": "চালিয়ে যান", "logout": "লগআউট"
    },
    "gu": {
      "login": "લૉગિન", "organizer": "ઓર્ગેનાઈઝર", "create id": "નવું ખાતું", "help": "મદદ", "lang": "ભાષા", "accounts": "ખાતા",
      "home": "હોમ", "explore": "એક્સપ્લોર", "matches": "મેચ", "reels": "રીલ્સ", "clans": "ક્લેન", "profile": "પ્રોફાઇલ",
      "enter battleground": "એરીનામાં પ્રવેશ કરો", "resume": "ચાલુ રાખો", "logout": "લૉગઆઉટ"
    },
    "pa": {
      "login": "ਲੌਗਇਨ", "organizer": "ਆਰਗੇਨਾਈਜ਼ਰ", "create id": "ਨਵਾਂ ਖਾਤਾ", "help": "ਮਦਦ", "lang": "ਭਾਸ਼ਾ", "accounts": "ਖਾਤੇ",
      "home": "ਹੋਮ", "explore": "ਐਕਸਪਲੋਰ", "matches": "ਮੈਚ", "reels": "ਰੀਲਜ਼", "clans": "ਕਲੈਨ", "profile": "ਪ੍ਰੋਫਾਈਲ",
      "enter battleground": "ਐਰੀਨਾ ਵਿੱਚ ਦਾਖਲ ਹੋਵੋ", "resume": "ਜਾਰੀ ਰੱਖੋ", "logout": "ਲੌਗਆਊਟ"
    },
    "or": { "login": "ଲଗଇନ୍", "home": "ହୋମ୍", "explore": "ଏକ୍ସପ୍ଲୋର୍", "help": "ସାହାଯ୍ୟ", "lang": "ଭାଷା", "profile": "ପ୍ରୋଫାଇଲ୍" },
    "as": { "login": "লগইন", "home": "হোম", "explore": "এক্সপ্ল'ৰ", "help": "সহায়", "lang": "ভাষা", "profile": "প্ৰ'ফাইল" },
    "ur": { "login": "لاگ ان", "home": "ہوم", "explore": "ایکسپلور", "help": "مدد", "lang": "زبان", "profile": "پروفائل", "enter battleground": "میدان میں اتریں" },
    "ne": { "login": "लगइन", "home": "होम", "explore": "एक्सप्लोर", "help": "मद्दत", "lang": "भाषा", "profile": "प्रोफाइल" },
    "sa": { "login": "प्रवेशः", "home": "गृहम्", "explore": "अन्वेषणम्", "help": "साहाय्यम्", "lang": "भाषा", "profile": "परिचयः" }
  };

  // Lossless Original English Text Registry (Prevents Double-Translation Drift)
  const origNodeText = new WeakMap();
  const origPlaceholder = new WeakMap();
  const memPacks = {};
  let observer = null;
  let mutTimer = null;
  let fetchInFlight = new Set();

  function getLangMeta(code) {
    return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
  }

  function getLang() {
    try {
      const saved = String(localStorage.getItem(LANG_KEY) || "en").toLowerCase();
      return LANGUAGES.some((l) => l.code === saved) ? saved : "en";
    } catch (e) { return "en"; }
  }

  function loadDevicePack(code) {
    if (memPacks[code]) return memPacks[code];
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(PACK_PREFIX + code) || "{}") || {}; } catch (e) { stored = {}; }
    memPacks[code] = { ...(BUILTIN[code] || {}), ...stored };
    return memPacks[code];
  }

  function saveDevicePack(code, pack) {
    memPacks[code] = pack;
    try {
      const entries = Object.entries(pack);
      const trimmed = entries.length > 900 ? Object.fromEntries(entries.slice(-900)) : pack;
      localStorage.setItem(PACK_PREFIX + code, JSON.stringify(trimmed));
    } catch (e) {}
  }

  function shouldSkipString(txt) {
    if (!txt) return true;
    const t = txt.trim();
    if (t.length < 2 || t.length > 260) return true;
    if (/^[\d\s.,:%₹$#+\-•|\/×↗→←✓✗⚡🎧🔑🏆🔥👑📍()[\]]+$/.test(t)) return true;
    if (/^https?:\/\//i.test(t) || /\S+@\S+\.\S+/.test(t)) return true;
    if (/^(TOURNYX|TOURNYX\.|TOURNYX ESPORTS|QUVA|BGMI|FREE FIRE MAX|CODM|VALORANT|IN-SOUTH-1|LIVE|AUTO|ULTRA|BALANCED|LITE|v\d+\.\d+)/i.test(t) && t.length <= 22) return true;
    return false;
  }

  function normKey(txt) {
    return String(txt || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function isSkippedElement(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "SVG", "TEXTAREA", "OPTION"].includes(tag)) return true;
    if (el.closest?.("[data-no-translate], .no-translate, .notranslate")) return true;
    return false;
  }

  // Batch Fetch Missing Strings for Native Indian Script Languages & Cache Permanently on Device
  async function warmMissingStringsOnline(langCode, missingList) {
    const meta = getLangMeta(langCode);
    if (!missingList.length || meta.script === "en" || meta.script === "combo" || !navigator.onLine) return;

    const unique = [...new Set(missingList)].filter((s) => !fetchInFlight.has(`${langCode}::${s}`)).slice(0, 45);
    if (!unique.length) return;
    unique.forEach((s) => fetchInFlight.add(`${langCode}::${s}`));

    const SEP = "\n§§§\n";
    const joined = unique.join(SEP);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(meta.script)}&dt=t&q=${encodeURIComponent(joined)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const translatedFull = Array.isArray(json?.[0]) ? json[0].map((seg) => seg?.[0] || "").join("") : "";
      const parts = translatedFull.split(/\s*§§§\s*/);
      if (parts.length === unique.length) {
        const pack = loadDevicePack(langCode);
        unique.forEach((orig, idx) => {
          const tr = String(parts[idx] || "").trim();
          if (tr) pack[normKey(orig)] = tr;
        });
        saveDevicePack(langCode, pack);
        translateSubtree(document.body, langCode, false);
      }
    } catch (e) {
      // Offline-safe silent fallback: bundled pack remains active
    } finally {
      unique.forEach((s) => fetchInFlight.delete(`${langCode}::${s}`));
    }
  }

  // Millisecond DOM Subtree Translator (Runs in < 3ms From On-Device Pack)
  function translateSubtree(root, langCode, allowOnlineWarmup = true) {
    if (!root) return;
    const meta = getLangMeta(langCode);
    const pack = langCode === "en" ? null : loadDevicePack(langCode);
    const missing = [];

    // 1. Walk Text Nodes
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || isSkippedElement(parent)) continue;

      if (!origNodeText.has(node)) {
        origNodeText.set(node, node.nodeValue || "");
      }
      const rawOrig = origNodeText.get(node);
      if (langCode === "en") {
        if (node.nodeValue !== rawOrig) node.nodeValue = rawOrig;
        continue;
      }

      const trimmed = rawOrig.trim();
      if (shouldSkipString(trimmed)) continue;

      const lead = rawOrig.slice(0, rawOrig.indexOf(trimmed));
      const trail = rawOrig.slice(rawOrig.indexOf(trimmed) + trimmed.length);
      const key = normKey(trimmed);

      if (pack && pack[key]) {
        const nextVal = lead + pack[key] + trail;
        if (node.nodeValue !== nextVal) node.nodeValue = nextVal;
      } else if (allowOnlineWarmup && meta.script !== "combo") {
        missing.push(trimmed);
      }
    }

    // 2. Translate Input Placeholders
    if (root.querySelectorAll) {
      root.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => {
        if (el.closest?.("[data-no-translate]")) return;
        if (!origPlaceholder.has(el)) origPlaceholder.set(el, el.getAttribute("placeholder") || "");
        const orig = origPlaceholder.get(el);
        if (langCode === "en") {
          if (el.getAttribute("placeholder") !== orig) el.setAttribute("placeholder", orig);
          return;
        }
        const key = normKey(orig);
        if (pack && pack[key]) el.setAttribute("placeholder", pack[key]);
        else if (allowOnlineWarmup && meta.script !== "combo" && !shouldSkipString(orig)) missing.push(orig);
      });
    }

    if (allowOnlineWarmup && missing.length > 0) {
      warmMissingStringsOnline(langCode, missing);
    }
  }

  function applyLanguage(code = getLang()) {
    const meta = getLangMeta(code);
    document.documentElement.lang = meta.script === "combo" ? "en-IN" : `${meta.code}-IN`;
    document.documentElement.dir = meta.dir || "ltr";
    if (document.body) translateSubtree(document.body, meta.code, true);
    window.dispatchEvent(new CustomEvent("tournyx:lang-change", { detail: meta }));
    return meta;
  }

  function setLanguage(code) {
    const meta = getLangMeta(code);
    try { localStorage.setItem(LANG_KEY, meta.code); } catch (e) {}
    return applyLanguage(meta.code);
  }

  function t(englishText) {
    const code = getLang();
    if (code === "en") return englishText;
    const pack = loadDevicePack(code);
    return pack[normKey(englishText)] || englishText;
  }

  function startObserver() {
    if (observer || !document.body || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(() => {
      const code = getLang();
      if (code === "en") return;
      clearTimeout(mutTimer);
      mutTimer = setTimeout(() => translateSubtree(document.body, code, true), 90);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.TournyxI18n = {
    LANGUAGES,
    getLang,
    getLangMeta,
    setLanguage,
    applyLanguage,
    t
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyLanguage(getLang());
      startObserver();
    });
  } else {
    applyLanguage(getLang());
    startObserver();
  }
})();
