const firebaseConfig = {
  apiKey: "AIzaSyA6nMNGUhelTupngagwbmUDubK3j2CK3xA",
  authDomain: "skilllentrix-c7aa1.firebaseapp.com",
  projectId: "skilllentrix-c7aa1",
  storageBucket: "skilllentrix-c7aa1.firebasestorage.app",
  messagingSenderId: "339365611288",
  appId: "1:339365611288:web:9f5789126d30b849d7806d",
  measurementId: "G-10YCXVYK0K"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const analytics = firebase.analytics();

console.log("Firebase Connected");