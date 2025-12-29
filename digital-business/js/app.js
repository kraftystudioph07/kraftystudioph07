// js/app.js
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
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-storage.js";

/* ==========================
   Firebase config & init
   ========================== */
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

/* ==========================
   Utilities & Page Detection
   ========================== */
const $ = (id) => document.getElementById(id);
const path = window.location.pathname || "";
const onPage = (filename) => path.includes(filename);

// shared param
const urlParams = new URLSearchParams(window.location.search);
const nfcId = urlParams.get("id");

/* ==========================
   Safe DOM refs (may be null)
   ========================== */
const registrationDiv = $("registrationDiv");
const editDiv = $("editDiv");
const profileDivElem = $("profileDiv");
const loginDiv = $("loginDiv");

const regSaveBtn = $("regSaveBtn");
const editSaveBtn = $("editSaveBtn");
const loginEditBtn = $("loginEditBtn");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");

const regName = $("regName");
const regEmail = $("regEmail");
const regPassword = $("regPassword");
const regPosition = $("regPosition");
const regPhone = $("regPhone");
const regWebsite = $("regWebsite");
const regFacebook = $("regFacebook");
const regInstagram = $("regInstagram");
const regTikTok = $("regTikTok");
const regLinkedin = $("regLinkedin");

const editName = $("editName");
const editPosition = $("editPosition");
const editPhone = $("editPhone");
const editWebsite = $("editWebsite");
const editFacebook = $("editFacebook");
const editInstagram = $("editInstagram");
const editTikTok = $("editTikTok");
const editLinkedin = $("editLinkedin");

// Profile display
const profileName = $("profileName");
const profilePosition = $("profilePosition");
const profilePhone = $("profilePhone");
const profileEmail = $("profileEmail");
const profileWebsite = $("profileWebsite");
const facebookLink = $("facebookLink");
const instagramLink = $("instagramLink");
const tiktokLink = $("tiktokLink");
const linkedinLink = $("linkedinLink");
const profilePhoto = $("profilePhoto");
const profileCoverImage = $("profileCoverImage"); // cover used as banner

// Photo inputs & previews (profile)
const regPhoto = $("regPhoto");
const photoPreview = $("photoPreview");
const editPhotoInput = $("editPhoto");
const editPhotoPreview = $("editPhotoPreview");

// Cover image (single cover used as banner)
const regCover = $("regCover");
const regCoverPreview = $("regCoverPreview");
const editCoverInput = $("editCover");
const editCoverPreview = $("editCoverPreview");

// Other helpers
const togglePassword = $("togglePassword");
const toggleLoginPassword = $("toggleLoginPassword");
const toastElem = $("toast");
const loaderOverlay = $("loaderOverlay");
const saveContactBtn = $("saveContactBtn");

/* ==========================
   Loader & Toast
   ========================== */
function showLoader() {
  const loader = $("loaderOverlay");
  if (!loader) return;
  loader.style.display = "flex";
  loader.classList.remove("hidden");
}
function hideLoader() {
  const loader = $("loaderOverlay");
  if (!loader) return;
  loader.classList.add("hidden");
  setTimeout(() => {
    loader.style.display = "none";
  }, 500);
}
function showToast(message, duration = 3000) {
  const toast = $("toast");
  if (!toast) {
    console.warn("Toast missing:", message);
    return;
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.top = "50px";
  toast.style.pointerEvents = "auto";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.top = "30px";
    toast.style.pointerEvents = "none";
  }, duration);
}

/* ==========================
   Upload helpers (profile/cover)
   ========================== */
async function uploadProfilePhoto(nfcIdParam, uid, file) {
  if (!file) return null;
  const storageRef = ref(storage, `profile_photos/${nfcIdParam}/${uid}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}
async function uploadCoverImage(nfcIdParam, uid, file) {
  if (!file) return null;
  const storageRef = ref(storage, `cover_images/${nfcIdParam}/${uid}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

/* ==========================
   File validation helper
   ========================== */
function validateImageFile(file, maxMb = 5) {
  if (!file) return { ok: true };
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > maxMb)
    return { ok: false, reason: `File must be < ${maxMb} MB` };
  if (!allowed.includes(file.type))
    return { ok: false, reason: "Only JPG, PNG, or WEBP allowed" };
  return { ok: true };
}

/* ==========================
   Cover dimension validator (max 624 x 240)
   Returns a Promise that resolves to {ok: boolean, w, h}
   ========================== */
function validateCoverDimensionsPromise(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: true });

    const img = new Image();
    img.onload = () => {
      resolve({
        ok: img.width >= img.height, // square or landscape
        w: img.width,
        h: img.height,
      });
    };
    img.onerror = () => resolve({ ok: false });
    img.src = URL.createObjectURL(file);
  });
}

function optimizeCoverImage(file) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      let targetW;
      let targetH;

      // Square
      if (img.width === img.height) {
        targetW = 512;
        targetH = 512;
      }
      // Landscape
      else {
        targetW = 624;
        targetH = Math.round((img.height / img.width) * targetW);
      }

      canvas.width = targetW;
      canvas.height = targetH;

      const isPNG = file.type === "image/png";

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const outputType = isPNG ? "image/png" : "image/jpeg";
      canvas.toBlob((blob) => resolve(blob), outputType, 0.8);
    };

    img.src = URL.createObjectURL(file);
  });
}

/* ==========================
   loadProfile - loads name/position/photo/cover/socials
   ========================== */
async function loadProfile() {
  // Hide all possible layouts first
  if (registrationDiv) registrationDiv.style.display = "none";
  if (editDiv) editDiv.style.display = "none";
  if (profileDivElem) profileDivElem.style.display = "none";
  if (loginDiv) loginDiv.style.display = "none";

  // Detect which page we are on
  const currentPage = window.location.pathname;

  // Handle no NFC ID
  if (!nfcId) {
    console.warn("No NFC ID found in URL");

    // If profile page with no ID → show toast
    if (currentPage.includes("krafty-profile")) {
      showToast("Missing NFC ID.");
      return;
    }

    // If login page → show login
    if (currentPage.includes("krafty-login") && loginDiv) {
      loginDiv.style.display = "block";
      hideLoader();
    }

    return;
  }

  showLoader();

  try {
    // ============================
    // STEP 1 — CHECK allowedUIDs
    // ============================

    const allowedRef = doc(db, "allowedUIDs", nfcId);
    const allowedSnap = await getDoc(allowedRef);

    if (!allowedSnap.exists()) {
      hideLoader();
      alert("This NFC ID is not registered in allowedUIDs.");
      window.location.href = "krafty-login.html";
      return;
    }

    // ============================
    // STEP 2 — CHECK users/{id}
    // ============================

    const userRef = doc(db, "users", nfcId);
    const userSnap = await getDoc(userRef);

    // ============================
    // CASE A — USER DOES NOT EXIST → Show registration
    // ============================
    if (!userSnap.exists()) {
      if (currentPage.includes("krafty-register")) {
        if (registrationDiv) {
          registrationDiv.style.display = "block";
        } else {
          console.error("registrationDiv missing in HTML!");
        }
      } else {
        window.location.href = `krafty-register.html?id=${encodeURIComponent(
          nfcId
        )}`;
      }

      hideLoader();
      return;
    }

    // ============================
    // CASE B — USER EXISTS → SHOW PROFILE
    // ============================
    const data = userSnap.data();

    // Load only if we are on profile page
    if (currentPage.includes("krafty-profile")) {
      if (profileDivElem) profileDivElem.style.display = "block";

      if (profileName) profileName.textContent = data.name || "";
      if (profilePosition) profilePosition.textContent = data.position || "";

      if (profilePhoto)
        profilePhoto.src = data.photoUrl || "images/default-profile.png";

      if (profileCoverImage)
        profileCoverImage.src = data.coverUrl || "images/kraftylogo-white.png";

      // Contact fields
      function toggleField(elem, value, type) {
        if (!elem) return;

        const textSpan = elem.querySelector(".contact-text");

        if (!value || value.trim() === "") {
          elem.style.display = "none";
          elem.onclick = null;
          if (textSpan) textSpan.textContent = "";
          return;
        }

        elem.style.display = "flex";
        if (textSpan) textSpan.textContent = value;

        if (type === "email") {
          elem.onclick = () => {
            window.location.href = `mailto:${value}`;
          };
        }

        if (type === "phone") {
          elem.onclick = () => {
            window.location.href = `tel:${value}`;
          };
        }

        if (type === "website") {
          elem.onclick = () => {
            const v = value.startsWith("http") ? value : `https://${value}`;
            window.open(v, "_blank");
          };
        }
      }

      toggleField(profileEmail, data.email, "email");
      toggleField(profilePhone, data.socials?.phone, "phone");
      toggleField(profileWebsite, data.socials?.website, "website");

      //Helper Function for social link
      function normalizeUrl(url) {
        if (!url) return "";
        return url.startsWith("http://") || url.startsWith("https://")
          ? url
          : "https://" + url;
      }

      // Socials
      ["facebook", "instagram", "tiktok", "linkedin"].forEach((p) => {
        const el = document.getElementById(p + "Link");
        const url = data.socials?.[p];

        if (!el) return;

        if (!url || url.trim() === "") {
          el.style.display = "none";
        } else {
          el.href = normalizeUrl(url);
          el.style.display = "inline-block";
        }
      });
      const socialRow = document.querySelector(".social-row");
      const profilesavebtn = document.querySelector(".profile-save-btn");

      if (socialRow) {
        const socials = ["facebook", "instagram", "tiktok", "linkedin"];
        const hasAnySocial = socials.some((p) => data.socials?.[p]?.trim());

        socialRow.style.display = hasAnySocial ? "flex" : "none";
        profilesavebtn.style.margin = hasAnySocial ? "10px auto" : "0 auto";
      }
    }
  } catch (err) {
    console.error("loadProfile error:", err);
    showToast("Error loading profile: " + err.message);
  } finally {
    hideLoader();
  }
}

/* ==========================
   Register page
   ========================== */
function initRegisterPage() {
  if (!onPage("krafty-register.html")) return;
  if (loaderOverlay) hideLoader();

  // Previews: profile photo
  if (regPhoto && photoPreview) {
    regPhoto.addEventListener("change", () => {
      const file = regPhoto.files[0];
      const valid = validateImageFile(file);
      if (!valid.ok) {
        showToast(valid.reason);
        regPhoto.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        photoPreview.src = reader.result;
        const overlay = document.querySelector(".upload-overlay");
        if (overlay) overlay.style.display = "none";
      };
      reader.readAsDataURL(file);
    });
  }

  // Cover preview with dimension validation
  if (regCover && regCoverPreview) {
    regCover.addEventListener("change", async () => {
      const file = regCover.files[0];
      const valid = validateImageFile(file);
      if (!valid.ok) {
        showToast(valid.reason);
        regCover.value = "";
        return;
      }

      const dim = await validateCoverDimensionsPromise(file);
      if (!dim.ok) {
        showToast(
          `Cover must be Square or Rectangle (uploaded: ${dim.w}×${dim.h})`
        );
        regCover.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => (regCoverPreview.src = reader.result);
      reader.readAsDataURL(file);
    });
  }

  // Toggle password
  if (togglePassword && regPassword) {
    togglePassword.addEventListener("click", () => {
      // Toggle password visibility
      const regPassword = document.getElementById("regPassword");
      regPassword.type = regPassword.type === "password" ? "text" : "password";

      // Toggle eye icon
      togglePassword.classList.toggle("fa-eye-slash");

      // Trigger blink animation
      togglePassword.classList.add("blink");
      setTimeout(() => togglePassword.classList.remove("blink"), 200);

      // Optional: Toggle slash animation
      togglePassword.classList.toggle("slash");
    });
  }

  if (regSaveBtn) {
    regSaveBtn.addEventListener("click", async () => {
      showLoader();
      const name = regName?.value?.trim() || "";
      const email = regEmail?.value?.trim() || "";
      const password = regPassword?.value?.trim() || "";
      const file = regPhoto?.files?.[0];
      const coverFile = regCover?.files?.[0];

      const missing = [];
      if (!name) missing.push("Name");
      if (!email) missing.push("Email");
      if (!password) missing.push("Password");
      if (missing.length) {
        hideLoader();
        showToast(
          `${missing.join(", ")} ${
            missing.length === 1 ? "is" : "are"
          } required`
        );
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        hideLoader();
        showToast("Enter a valid email");
        return;
      }

      // validate files (small) and cover dimensions
      for (const f of [file, coverFile]) {
        const v = validateImageFile(f);
        if (!v.ok) {
          hideLoader();
          showToast(v.reason);
          return;
        }
      }

      if (coverFile) {
        const dim = await validateCoverDimensionsPromise(coverFile);
        if (!dim.ok) {
          hideLoader();
          showToast(
            `Cover must be Square or Rectangle (uploaded: ${dim.w}×${dim.h})`
          );
          return;
        }
      }

      let uid = null;
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        uid = userCredential.user.uid;

        // upload profile photo (if any) — must be signed in now
        let photoURL = null;
        if (file) {
          // client-side ensure current user exists
          const currentUser = auth.currentUser;
          if (!currentUser) {
            hideLoader();
            showToast("Please login before uploading images.");
            return;
          }
          try {
            photoURL = await uploadProfilePhoto(nfcId, currentUser.uid, file);
          } catch (err) {
            console.error("Profile photo upload failed:", err);
            if (err?.code === "storage/unauthorized") {
              showToast("Profile photo upload denied by server rules.");
            } else {
              showToast(
                "Profile photo upload failed: " + (err.message || err.code)
              );
            }
            // continue: allow registration even if image upload failed
          }
        }

        // upload cover (if any)
        let coverURL = null;
        if (coverFile) {
          const currentUser = auth.currentUser;

          if (!currentUser) {
            hideLoader();
            showToast("Please login before uploading cover.");
            return;
          }
          const optimizedCover = await optimizeCoverImage(coverFile);
          try {
            coverURL = await uploadCoverImage(
              nfcId,
              currentUser.uid,
              optimizedCover
            );
          } catch (err) {
            console.error("Cover upload failed:", err);
            if (err?.code === "storage/unauthorized") {
              showToast("Cover upload denied by server rules.");
            } else {
              showToast("Cover upload failed: " + (err.message || err.code));
            }
            // continue without coverURL
          }
        }

        const data = {
          name,
          position: regPosition?.value?.trim() || "",
          email,
          photoUrl: photoURL || "images/default-profile.png",
          coverUrl: coverURL || "images/kraftylogo-white.png",
          socials: {
            phone: regPhone?.value?.trim() || "",
            website: regWebsite?.value?.trim() || "",
            facebook: regFacebook?.value?.trim() || "",
            instagram: regInstagram?.value?.trim() || "",
            tiktok: regTikTok?.value?.trim() || "",
            linkedin: regLinkedin?.value?.trim() || "",
          },
          authUid: uid,
        };

        await setDoc(doc(db, "users", nfcId), data);

        hideLoader();
        showToast("Profile registered!", 3000);
        window.location.href = `krafty-profile.html?id=${encodeURIComponent(
          nfcId
        )}`;
      } catch (err) {
        hideLoader();
        showToast("Error: " + err.message, 5000);
        if (uid) {
          try {
            const cur = auth.currentUser;
            if (cur && cur.uid === uid) await cur.delete();
          } catch (delErr) {
            console.error("Rollback delete failed", delErr);
          }
        }
      }
    });
  }

  loadProfile();
}

/* ==========================
   Login Page
   ========================== */
function initLoginPage() {
  if (!onPage("krafty-login.html")) return;

  if (loaderOverlay) hideLoader();

  if (toggleLoginPassword) {
    toggleLoginPassword.addEventListener("click", () => {
      // Toggle password visibility
      const loginPassword = document.getElementById("loginPassword");
      loginPassword.type =
        loginPassword.type === "password" ? "text" : "password";

      // Toggle eye icon
      toggleLoginPassword.classList.toggle("fa-eye-slash");

      // Trigger blink animation
      toggleLoginPassword.classList.add("blink");
      setTimeout(() => toggleLoginPassword.classList.remove("blink"), 200);

      // Optional: Toggle slash animation
      toggleLoginPassword.classList.toggle("slash");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (nfcId)
        window.location.href = `krafty-profile.html?id=${encodeURIComponent(
          nfcId
        )}`;
      else window.location.href = "krafty-profile.html";
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const email = $("loginEmail")?.value || "";
      const password = $("loginPassword")?.value || "";
      if (!email || !password) {
        showToast("Email and password required");
        return;
      }
      showLoader();
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user = credential.user;
        if (!nfcId) {
          hideLoader();
          showToast("Missing NFC ID");
          return;
        }
        const snap = await getDoc(doc(db, "users", nfcId));
        if (!snap.exists()) {
          hideLoader();
          alert("No profile for this NFC ID");
          return;
        }
        const data = snap.data();
        if (data.authUid !== user.uid) {
          hideLoader();
          alert("Not authorized");
          return;
        }
        hideLoader();
        window.location.href = `krafty-edit.html?id=${encodeURIComponent(
          nfcId
        )}`;
      } catch (err) {
        hideLoader();
        showToast("Login failed: " + err.message, 4000);
      }
    });
  }

  loadProfile();

  // ensure login UI displays reliably
  window.addEventListener("load", () => {
    if (loginDiv) loginDiv.style.display = "block";
    if (loaderOverlay) hideLoader();
  });
}

/* ==========================
   Edit Page (protected)
   ========================== */
function initEditPage() {
  if (!onPage("krafty-edit.html")) return;

  if (editDiv) editDiv.style.display = "none";
  if (loaderOverlay) showLoader();

  if (!nfcId) {
    window.location.href = "krafty-login.html";
    return;
  }

  // wait for auth and verify
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = `krafty-login.html?id=${encodeURIComponent(
        nfcId
      )}`;
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, "users", nfcId));
      if (!userSnap.exists()) {
        window.location.href = `krafty-login.html?id=${encodeURIComponent(
          nfcId
        )}`;
        return;
      }
      const data = userSnap.data();
      if (data.authUid !== user.uid) {
        window.location.href = `krafty-login.html?id=${encodeURIComponent(
          nfcId
        )}`;
        return;
      }

      // authorized — show UI
      if (editDiv) editDiv.style.display = "block";
      if (loaderOverlay) hideLoader();

      // populate & listeners
      populateEditForm(data);
      setupEditListeners();
    } catch (err) {
      console.error("Edit auth check failed", err);
      window.location.href = `krafty-login.html?id=${encodeURIComponent(
        nfcId
      )}`;
    }
  });

  function populateEditForm(data) {
    if (editName) editName.value = data.name || "";
    if (editPosition) editPosition.value = data.position || "";
    if (editPhone) editPhone.value = data.socials?.phone || "";
    if (editWebsite) editWebsite.value = data.socials?.website || "";
    if (editFacebook) editFacebook.value = data.socials?.facebook || "";
    if (editInstagram) editInstagram.value = data.socials?.instagram || "";
    if (editTikTok) editTikTok.value = data.socials?.tiktok || "";
    if (editLinkedin) editLinkedin.value = data.socials?.linkedin || "";
    if (editPhotoPreview)
      editPhotoPreview.src = data.photoUrl || "images/default-profile.png";
    if (editCoverPreview)
      editCoverPreview.src = data.coverUrl || "images/KraftyMain.png";
  }

  function setupEditListeners() {
    // cover preview with dimension validation
    if (editCoverInput && editCoverPreview) {
      editCoverInput.addEventListener("change", async () => {
        const file = editCoverInput.files[0];
        const valid = validateImageFile(file);
        if (!valid.ok) {
          showToast(valid.reason);
          editCoverInput.value = "";
          return;
        }

        const dim = await validateCoverDimensionsPromise(file);
        if (!dim.ok) {
          showToast(
            `Cover must be Sqaure or Rectangle (uploaded: ${dim.w}×${dim.h})`
          );
          editCoverInput.value = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = () => (editCoverPreview.src = reader.result);
        reader.readAsDataURL(file);
      });
    }

    // profile photo preview
    if (editPhotoInput && editPhotoPreview) {
      editPhotoInput.addEventListener("change", () => {
        const file = editPhotoInput.files[0];
        const valid = validateImageFile(file);
        if (!valid.ok) {
          showToast(valid.reason);
          editPhotoInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => (editPhotoPreview.src = reader.result);
        reader.readAsDataURL(file);
      });
    }

    // Save changes
    if (editSaveBtn) {
      // remove and reattach to avoid duplicate listeners
      editSaveBtn.replaceWith(editSaveBtn.cloneNode(true));
      const newSave = $("editSaveBtn");
      newSave.addEventListener("click", async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          window.location.href = `krafty-login.html?id=${encodeURIComponent(
            nfcId
          )}`;
          return;
        }

        showLoader();
        try {
          const userSnap = await getDoc(doc(db, "users", nfcId));
          if (!userSnap.exists()) {
            hideLoader();
            showToast("Profile not found");
            return;
          }
          const data = userSnap.data();
          if (data.authUid !== currentUser.uid) {
            hideLoader();
            alert("Not authorized");
            return;
          }

          // uploads
          const photoFile = editPhotoInput?.files?.[0];
          const coverFile = editCoverInput?.files?.[0];

          for (const f of [photoFile, coverFile]) {
            const v = validateImageFile(f);
            if (!v.ok) {
              hideLoader();
              showToast(v.reason);
              return;
            }
          }

          if (coverFile) {
            const dim = await validateCoverDimensionsPromise(coverFile);
            if (!dim.ok) {
              hideLoader();
              showToast(
                `Cover must be Square or Rectangle (uploaded: ${dim.w}×${dim.h})`
              );
              return;
            }
          }

          let photoURL = null;
          if (photoFile) {
            try {
              photoURL = await uploadProfilePhoto(
                nfcId,
                currentUser.uid,
                photoFile
              );
            } catch (err) {
              console.error("Profile photo upload failed:", err);
              if (err?.code === "storage/unauthorized")
                showToast("Profile photo upload denied.");
              else
                showToast(
                  "Profile photo upload failed: " + (err.message || err.code)
                );
            }
          }

          let coverURL = null;
          if (coverFile) {
            try {
              const optimizedCover = await optimizeCoverImage(coverFile);

              coverURL = await uploadCoverImage(
                nfcId,
                currentUser.uid,
                optimizedCover
              );
            } catch (err) {
              console.error("Cover upload failed:", err);
              if (err?.code === "storage/unauthorized")
                showToast("Cover upload denied.");
              else
                showToast("Cover upload failed: " + (err.message || err.code));
            }
          }

          const updated = {
            name: editName?.value?.trim() || data.name || "",
            position: editPosition?.value?.trim() || data.position || "",
            email: data.email || currentUser.email || "",
            photoUrl: photoURL || data.photoUrl || "images/default-profile.png",
            coverUrl: coverURL || data.coverUrl || "images/KraftyMain.png",
            socials: {
              phone: editPhone
                ? editPhone.value.trim()
                : data.socials?.phone ?? "",
              website: editWebsite
                ? editWebsite.value.trim()
                : data.socials?.website ?? "",
              facebook: editFacebook
                ? editFacebook.value.trim()
                : data.socials?.facebook ?? "",
              instagram: editInstagram
                ? editInstagram.value.trim()
                : data.socials?.instagram ?? "",
              tiktok: editTikTok
                ? editTikTok.value.trim()
                : data.socials?.tiktok ?? "",
              linkedin: editLinkedin
                ? editLinkedin.value.trim()
                : data.socials?.linkedin ?? "",
            },
            authUid: currentUser.uid,
          };

          await setDoc(doc(db, "users", nfcId), updated);

          if (photoURL && profilePhoto) profilePhoto.src = photoURL;
          if (coverURL && profileCoverImage) profileCoverImage.src = coverURL;

          hideLoader();
          showToast("Profile updated!", 3000);
          window.location.href = `krafty-profile.html?id=${encodeURIComponent(
            nfcId
          )}`;
        } catch (err) {
          console.error("edit save error", err);
          hideLoader();
          showToast("Update error: " + err.message, 5000);
        }
      });
    }

    // Logout on edit page
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await signOut(auth);
          window.location.href = `krafty-profile.html?id=${encodeURIComponent(
            nfcId
          )}`;
        } catch (err) {
          console.error("logout failed", err);
        }
      });
    }
  }
}

/* ==========================
   Profile Page
   ========================== */
function initProfilePage() {
  if (!onPage("krafty-profile.html")) return;

  if (loginEditBtn) {
    loginEditBtn.addEventListener("click", () => {
      window.location.href = `krafty-login.html?id=${encodeURIComponent(
        nfcId
      )}`;
    });
  }

  // Updated vCard + embedded-photo handler (replace your existing handler with this)
  if (saveContactBtn) {
    saveContactBtn.addEventListener("click", async () => {
      if (!profileDivElem || profileDivElem.style.display === "none") {
        alert("Profile not loaded yet.");
        return;
      }

      // ====== GET TEXT FIELDS (trimmed) ======
      const name = (profileName?.textContent || "").trim();
      const position = (profilePosition?.textContent || "").trim();
      const email = (profileEmail?.textContent || "").trim();
      const phone = (profilePhone?.textContent || "").trim();
      let website = (profileWebsite?.textContent || "").trim();
      const facebook = facebookLink?.href || "";
      const instagram = instagramLink?.href || "";
      const tiktok = tiktokLink?.href || "";
      const linkedin = linkedinLink?.href || "";

      // normalize website to include protocol (https preferred)
      if (website && !/^https?:\/\//i.test(website)) {
        website = "https://" + website;
      }

      // ====== GET PHOTO URL FROM IMG TAG ======
      const imgElem = document.getElementById("profilePhoto");
      const photoUrl = imgElem?.src || "";

      // ====== PROXY (your Cloud Function) ======
      const funcBase =
        "https://us-central1-krafty-studio-ph.cloudfunctions.net/proxyImage";

      // ====== HELPERS ======
      const CRLF = "\r\n";

      function buildN(fullName) {
        if (!fullName) return ";;;";
        const parts = fullName.trim().split(/\s+/);
        const first = parts.shift() || "";
        const last = parts.join(" ") || "";
        return `${last};${first};;;`;
      }

      // Convert Blob -> base64 (data URL -> base64)
      function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const s = r.result || "";
            const idx = s.indexOf(",") + 1;
            resolve(s.slice(idx));
          };
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      }

      // Fold base64 into 75-char chunks for vCard with RFC-style continuation lines.
      function foldBase64ForVCard(base64) {
        const CHUNK = 75;
        const parts = [];
        for (let i = 0; i < base64.length; i += CHUNK) {
          parts.push(base64.slice(i, i + CHUNK));
        }
        // first piece no prefix, subsequent pieces prefixed with CRLF + single space
        return parts.map((p, i) => (i === 0 ? p : CRLF + " " + p)).join("");
      }

      // ====== TRY TO FETCH & EMBED PHOTO  ======
      let base64Photo = "";
      let photoMime = "JPEG";

      if (photoUrl) {
        try {
          const proxiedUrl = `${funcBase}?url=${encodeURIComponent(photoUrl)}`;
          const res = await fetch(proxiedUrl);
          if (!res.ok) throw new Error("proxy fetch failed: " + res.status);

          const blob = await res.blob();

          // detect MIME
          photoMime = blob.type?.toLowerCase().includes("png") ? "PNG" : "JPEG";

          // convert original blob → base64 (no resizing)
          base64Photo = await blobToBase64(blob);
        } catch (err) {
          console.error("Could not fetch/embed photo through proxy:", err);
          base64Photo = ""; // fallback to URI if embed fails
        }
      }

      // ====== BUILD VCARD LINES (CRLF) ======
      const lines = [];
      lines.push("BEGIN:VCARD");
      lines.push("VERSION:3.0");

      // N and FN (N is important for Apple)
      lines.push(`N:${buildN(name)}`);
      lines.push(`FN:${name || ""}`);

      if (position) lines.push(`TITLE:${position}`);
      if (email) lines.push(`EMAIL;TYPE=WORK:${email}`);
      if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
      if (website) lines.push(`URL:${website}`);
      if (facebook) lines.push(`X-SOCIALPROFILE;TYPE=Facebook:${facebook}`);
      if (instagram) lines.push(`X-SOCIALPROFILE;TYPE=Instagram:${instagram}`);
      if (tiktok) lines.push(`X-SOCIALPROFILE;TYPE=TikTok:${tiktok}`);
      if (linkedin) lines.push(`X-SOCIALPROFILE;TYPE=LinkedIn:${linkedin}`);

      // PHOTO: header on its own line, then folded base64 lines (RFC)
      if (base64Photo) {
        const folded = foldBase64ForVCard(base64Photo);
        lines.push(`PHOTO;ENCODING=BASE64;TYPE=${photoMime}:${folded}`); // header
      } else if (photoUrl) {
        // fallback: include original image URI (works for some clients)
        lines.push(`PHOTO;VALUE=URI:${photoUrl}`);
      }

      lines.push("END:VCARD");

      // Join. folded base64 entry already includes CRLFs; joining with CRLF preserves correct structure.
      const vCard = lines.join(CRLF);

      // ====== DOWNLOAD .VCF ======
      try {
        const blobOut = new Blob([vCard], { type: "text/vcard;charset=utf-8" });
        const u = URL.createObjectURL(blobOut);
        const a = document.createElement("a");
        a.href = u;
        a.download = `${(name || "contact").replace(/\s+/g, "_")}.vcf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(u);
      } catch (err) {
        console.error("Failed to create/download vCard:", err);
        alert("Error creating vCard. See console for details.");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        window.location.href = `krafty-profile.html?id=${encodeURIComponent(
          nfcId
        )}`;
      } catch (err) {
        console.error("logout failed", err);
      }
    });
  }

  loadProfile();
}

/* ==========================
   Generic toggles & previews
   ========================== */

if (regPhoto && photoPreview) {
  regPhoto.addEventListener("change", () => {
    const file = regPhoto.files[0];
    const v = validateImageFile(file);
    if (!v.ok) {
      showToast(v.reason);
      regPhoto.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoPreview.src = reader.result;
      const overlay = document.querySelector(".upload-overlay");
      if (overlay) overlay.style.display = "none";
    };
    reader.readAsDataURL(file);
  });
}

/* ==========================
   Init on DOMContentLoaded
   ========================== */
document.addEventListener("DOMContentLoaded", () => {
  if (loaderOverlay) setTimeout(() => hideLoader(), 300);
  initRegisterPage();
  initLoginPage();
  initEditPage();
  initProfilePage();
});
