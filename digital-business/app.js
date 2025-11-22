import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-storage.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBj5bCv014vXcs5QUVGM9wQoB4XPf17GSA",
  authDomain: "krafty-studio-ph.firebaseapp.com",
  projectId: "krafty-studio-ph",
  storageBucket: "krafty-studio-ph.firebasestorage.app",
  messagingSenderId: "772555708502",
  appId: "1:772555708502:web:7c22548977a516d6f383f7",
  measurementId: "G-RKGFNYQDR8",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Get NFC ID from URL
const urlParams = new URLSearchParams(window.location.search);
const nfcId = urlParams.get("id");
if (!nfcId) alert("No NFC ID in URL!");

// DOM elements
const registrationDiv = document.getElementById("registrationDiv");
const editDiv = document.getElementById("editDiv");
const profileDivElem = document.getElementById("profileDiv");
const loginDiv = document.getElementById("loginDiv");

const regSaveBtn = document.getElementById("regSaveBtn");
const editSaveBtn = document.getElementById("editSaveBtn");
const loginEditBtn = document.getElementById("loginEditBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regPosition = document.getElementById("regPosition");
const regPhone = document.getElementById("regPhone");
const regWebsite = document.getElementById("regWebsite");
const regFacebook = document.getElementById("regFacebook");
const regInstagram = document.getElementById("regInstagram");
const regTikTok = document.getElementById("regTikTok");
const regLinkedin = document.getElementById("regLinkedin");

const editName = document.getElementById("editName");
const editPosition = document.getElementById("editPosition");
const editPhone = document.getElementById("editPhone");
const editWebsite = document.getElementById("editWebsite");
const editFacebook = document.getElementById("editFacebook");
const editInstagram = document.getElementById("editInstagram");
const editTikTok = document.getElementById("editTikTok");
const editLinkedin = document.getElementById("editLinkedin");

// Profile display elements
const profileName = document.getElementById("profileName");
const profilePosition = document.getElementById("profilePosition");
const profilePhone = document.getElementById("profilePhone");
const profileEmail = document.getElementById("profileEmail");
const profileWebsite = document.getElementById("profileWebsite");
const facebookLink = document.getElementById("facebookLink");
const instagramLink = document.getElementById("instagramLink");
const tiktokLink = document.getElementById("tiktokLink");
const linkedinLink = document.getElementById("linkedinLink");
const profilePhoto = document.getElementById("profilePhoto");

// Profile Photo elements
const regPhoto = document.getElementById("regPhoto");
const photoPreview = document.getElementById("photoPreview");

// Other function elements
const togglePassword = document.getElementById("togglePassword");
const toggleLoginPassword = document.getElementById("toggleLoginPassword");

// ===== Load profile =====
async function loadProfile() {
  // Hide all sections
  registrationDiv.style.display = "none";
  editDiv.style.display = "none";
  profileDivElem.style.display = "none";
  loginDiv.style.display = "none";

  if (!nfcId) {
    alert("No NFC ID in URL!");
    return;
  }

  // Check if NFC ID is allowed
  const allowedSnap = await getDoc(doc(db, "allowedUIDs", nfcId));
  if (!allowedSnap.exists()) {
    alert("No NFC ID exists!");
    return; // stop here
  }

  // Check user profile
  const userSnap = await getDoc(doc(db, "users", nfcId));

  if (!userSnap.exists() || !userSnap.data().name) {
    // NFC ID allowed but user not registered → show registration
    registrationDiv.style.display = "block";
  } else {
    // Profile exists → show profile view
    const data = userSnap.data();
    profileDivElem.style.display = "block";

    profileName.textContent = data.name || "";
    profilePosition.textContent = data.position || "";

    function toggleField(elem, value, type) {
      if (!value || value.trim() === "") {
        elem.style.display = "none";
      } else {
        elem.style.display = "block";
        switch (type) {
          case "email":
            elem.textContent = "Email: " + value;
            elem.onclick = () => (window.location.href = `mailto:${value}`);
            break;
          case "phone":
            elem.textContent = "Call: " + value;
            elem.onclick = () => (window.location.href = `tel:${value}`);
            break;
          case "website":
            const url = value.startsWith("http") ? value : "https://" + value;
            elem.textContent = "Visit: " + value;
            elem.onclick = () => window.open(url, "_blank");
            break;
          default:
            elem.textContent = value;
        }
      }
    }

    toggleField(profileEmail, data.email, "email");
    toggleField(profilePhone, data.socials?.phone, "phone");
    toggleField(profileWebsite, data.socials?.website, "website");

    const socials = ["facebook", "instagram", "tiktok", "linkedin"];
    socials.forEach((platform) => {
      const linkElem = document.getElementById(platform + "Link");
      const url = data.socials?.[platform];
      if (!url || url.trim() === "") {
        linkElem.style.display = "none";
      } else {
        linkElem.href = url;
        linkElem.style.display = "inline-block";
      }
    });

    profilePhoto.src = data.photoUrl || "images/default-profile.png";
  }

  document.getElementById("loaderOverlay").classList.add("hidden");
}

loadProfile();

// ===== Registration =====
regSaveBtn.addEventListener("click", async () => {
  const loader = document.getElementById("loaderOverlay");
  showLoader(); // Show loader overlay

  const name = regName.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value.trim();
  const file = regPhoto.files[0];

  // --- Validate required fields dynamically ---
  const missingFields = [];
  if (!name) missingFields.push("Name");
  if (!email) missingFields.push("Email");
  if (!password) missingFields.push("Password");

  if (missingFields.length > 0) {
    hideLoader();
    showToast(
      missingFields.join(", ") +
        " " +
        (missingFields.length === 1 ? "is" : "are") +
        " required!"
    );
    return;
  }

  // --- Email format validation ---
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    hideLoader();
    showToast("Please enter a valid email address!");
    return;
  }

  // --- File validation ---
  if (file) {
    const MAX_FILE_SIZE_MB = 2;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      hideLoader();
      showToast(`Profile photo must be less than ${MAX_FILE_SIZE_MB} MB!`);
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      hideLoader();
      showToast("Only JPG, PNG, or WEBP images are allowed!");
      return;
    }
  }

  let uid = null;

  try {
    // --- Create Firebase Auth user ---
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    uid = userCredential.user.uid;

    // --- Upload profile photo ---
    let photoURL = null;
    if (file) {
      photoURL = await uploadProfilePhoto(nfcId, uid, file);
    }

    // --- Prepare Firestore data ---
    const data = {
      name,
      position: regPosition.value.trim(),
      email,
      photoUrl: photoURL || "images/default-profile.png",
      socials: {
        phone: regPhone.value.trim(),
        website: regWebsite.value.trim(),
        facebook: regFacebook.value.trim(),
        instagram: regInstagram.value.trim(),
        tiktok: regTikTok.value.trim(),
        linkedin: regLinkedin.value.trim(),
      },
      authUid: uid,
    };

    // --- Save to Firestore ---
    await setDoc(doc(db, "users", nfcId), data);

    hideLoader();
    showToast("Profile registered successfully!", 4000);
    loadProfile();
  } catch (err) {
    hideLoader();
    showToast("Error: " + err.message, 5000);

    // --- Rollback: delete user if Auth was created ---
    if (uid) {
      try {
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.uid === uid) {
          await currentUser.delete();
        }
      } catch (deleteErr) {
        console.error("Failed to delete user after error:", deleteErr);
      }
    }
  }
});




// ===== Login =====
loginEditBtn.addEventListener("click", () => {
  profileDivElem.style.display = "none";
  loginDiv.style.display = "block";
});

loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;


  showLoader(); // Show loader at start


  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    const docSnap = await getDoc(doc(db, "users", nfcId));
    if (!docSnap.exists()) {
      hideLoader();
      alert("No profile for this NFC ID.");
      return;
    }

    const data = docSnap.data();
    if (user.uid !== data.authUid) {
      hideLoader();
      alert("Not authorized to edit.");
      return;
    }

    loginDiv.style.display = "none";
    editDiv.style.display = "block";

    // Populate edit form
    editName.value = data.name || "";
    editPosition.value = data.position || "";
    editPhone.value = data.socials?.phone || "";
    editWebsite.value = data.socials?.website || "";
    editFacebook.value = data.socials?.facebook || "";
    editInstagram.value = data.socials?.instagram || "";
    editTikTok.value = data.socials?.tiktok || "";
    editLinkedin.value = data.socials?.linkedin || "";

    hideLoader();
  } catch (err) {
    hideLoader();
    showToast("Login failed: " + err.message);
  }
});

// ===== Edit Save =====
editSaveBtn.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Login required to edit.");
    return;
  }

  const user = auth.currentUser;

  const data = {
    name: editName.value,
    position: editPosition.value,
    email: user.email, // Keep original email
    socials: {
      phone: editPhone.value,
      website: editWebsite.value,
      facebook: editFacebook.value,
      instagram: editInstagram.value,
      tiktok: editTikTok.value,
      linkedin: editLinkedin.value,
    },
    authUid: user.uid,
  };

  try {
    await setDoc(doc(db, "users", nfcId), data);
    alert("Profile updated successfully!");
    loadProfile();
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// ===== Logout =====
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  loginDiv.style.display = "none";
  editDiv.style.display = "none";
  loadProfile();
});

// ===== Save My Contact (vCard) =====
const saveContactBtn = document.getElementById("saveContactBtn");

saveContactBtn.addEventListener("click", () => {
  if (
    !profileDivElem.style.display ||
    profileDivElem.style.display === "none"
  ) {
    alert("Profile not loaded yet.");
    return;
  }

  const name = profileName.textContent;
  const position = profilePosition.textContent;
  const email = profileEmail.textContent;
  const phone = profilePhone.textContent;
  const website = profileWebsite.textContent;
  const facebook = facebookLink.href !== "#" ? facebookLink.href : "";
  const instagram = instagramLink.href !== "#" ? instagramLink.href : "";
  const tiktok = tiktokLink.href !== "#" ? tiktokLink.href : "";
  const linkedin = linkedinLink.href !== "#" ? linkedinLink.href : "";

  let vCard = `BEGIN:VCARD
VERSION:3.0
FN:${name}
TITLE:${position}
EMAIL;TYPE=WORK:${email}
TEL;TYPE=CELL:${phone}
URL:${website}
X-SOCIALPROFILE;TYPE=Facebook:${facebook}
X-SOCIALPROFILE;TYPE=Instagram:${instagram}
X-SOCIALPROFILE;TYPE=TikTok:${tiktok}
X-SOCIALPROFILE;TYPE=LinkedIn:${linkedin}
END:VCARD`;

  const blob = new Blob([vCard], { type: "text/vcard" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/\s+/g, "_")}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// Toast Function
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.top = "50px"; // slightly move down when showing
  toast.style.pointerEvents = "auto";

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.top = "30px"; // slide back up when hiding
    toast.style.pointerEvents = "none";
  }, duration);
}

// Toggle Password
togglePassword.addEventListener("click", () => {
  // Toggle password visibility
  regPassword.type = regPassword.type === "password" ? "text" : "password";

  // Toggle eye icon
  togglePassword.classList.toggle("fa-eye-slash");

  // Trigger blink animation
  togglePassword.classList.add("blink");
  setTimeout(() => togglePassword.classList.remove("blink"), 200);

  // Toggle slash animation
  togglePassword.classList.toggle("slash");
});



toggleLoginPassword.addEventListener("click", () => {
  // Toggle password visibility
  const loginPassword = document.getElementById("loginPassword");
  loginPassword.type = loginPassword.type === "password" ? "text" : "password";

  // Toggle eye icon
  toggleLoginPassword.classList.toggle("fa-eye-slash");

  // Trigger blink animation
  toggleLoginPassword.classList.add("blink");
  setTimeout(() => toggleLoginPassword.classList.remove("blink"), 200);

  // Optional: Toggle slash animation
  toggleLoginPassword.classList.toggle("slash");
});


// Preview Profile Photo
regPhoto.addEventListener("change", () => {
  const file = regPhoto.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      photoPreview.src = reader.result; // show the uploaded photo
      // Hide the overlay after upload
      const overlay = document.querySelector(".upload-overlay");
      if (overlay) overlay.style.display = "none";
    };
    reader.readAsDataURL(file);
  }
});


// Upload Profile Photo
async function uploadProfilePhoto(nfcId, uid, file) {
  if (!file) return null;

  const storageRef = ref(storage, `profile_photos/${nfcId}/${uid}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}


// Show full-screen loader
function showLoader() {
  const loader = document.getElementById("loaderOverlay");
  loader.style.display = "flex";
  loader.classList.remove("hidden"); // optional, if you use .hidden class for fade
}

// Hide loader
function hideLoader() {
  const loader = document.getElementById("loaderOverlay");
  loader.classList.add("hidden"); // fade out
  setTimeout(() => {
    loader.style.display = "none";
  }, 500); // match your CSS transition duration
}
