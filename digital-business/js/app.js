// Krafty Studio PH — optimized digital business card application
// Compatible with existing HTML IDs, Firestore schema, Storage paths and ?id= NFC URLs.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
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
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-storage.js";

// Keep these Firebase configuration values unchanged.
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
const $ = (id) => document.getElementById(id);
const onPage = (name) => location.pathname.includes(name);
const nfcId = new URLSearchParams(location.search).get("id");
const profileURL = () => `krafty-profile.html?id=${encodeURIComponent(nfcId)}`;
const loginURL = () => `krafty-login.html?id=${encodeURIComponent(nfcId)}`;
const registerURL = () =>
  `krafty-register.html?id=${encodeURIComponent(nfcId)}`;
const editURL = () => `krafty-edit.html?id=${encodeURIComponent(nfcId)}`;
const userRef = () => doc(db, "users", nfcId);
const DEFAULT_PHOTO = "images/default-profile.png";
const DEFAULT_COVER = "images/kraftylogo-white.png";
const MAX_GALLERY = 5;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_PROXY =
  "https://us-central1-krafty-studio-ph.cloudfunctions.net/proxyImage";
const PROFILE_SOCIALS = ["facebook", "instagram", "tiktok", "linkedin"];

let activeProfile = null;
let existingImages = [];
let newImages = [];
let deletedImages = [];
let hasUnsavedChanges = false;
let swiperInstance = null;
let toastTimer = null;
let loaderTimer = null;
const previewURLs = new WeakMap();

function showLoader() {
  const elem = $("loaderOverlay");
  if (!elem) return;
  clearTimeout(loaderTimer);
  elem.style.display = "flex";
  elem.classList.remove("hidden");
}
function hideLoader() {
  const elem = $("loaderOverlay");
  if (!elem) return;
  clearTimeout(loaderTimer);
  elem.classList.add("hidden");
  loaderTimer = setTimeout(() => {
    elem.style.display = "none";
  }, 500);
}
function showToast(message, duration = 3000) {
  const elem = $("toast");
  if (!elem) {
    console.warn(message);
    return;
  }
  clearTimeout(toastTimer);
  elem.textContent = message;
  Object.assign(elem.style, {
    opacity: "1",
    top: "50px",
    pointerEvents: "auto",
  });
  toastTimer = setTimeout(() => {
    Object.assign(elem.style, {
      opacity: "0",
      top: "30px",
      pointerEvents: "none",
    });
  }, duration);
}
function go(url) {
  location.href = url;
}
function getValue(id) {
  return $(id)?.value?.trim() ?? "";
}
function setValue(id, value) {
  const elem = $(id);
  if (elem) elem.value = value ?? "";
}
function setText(id, value) {
  const elem = $(id);
  if (elem) elem.textContent = value ?? "";
}
function setImage(id, url) {
  const elem = $(id);
  if (elem) elem.src = url;
}
function display(id, value) {
  const elem = $(id);
  if (elem) elem.style.display = value;
}
function requireId() {
  if (nfcId) return true;
  showToast("Missing NFC ID.");
  return false;
}
function validateImageFile(file, maxMB = 5) {
  if (!file) return { ok: true };
  if (!IMAGE_TYPES.has(file.type))
    return { ok: false, reason: "Only JPG, PNG, or WebP allowed" };
  if (file.size > maxMB * 1024 * 1024)
    return { ok: false, reason: `File must be below ${maxMB} MB` };
  return { ok: true };
}

// Blob URLs avoid FileReader's extra base64 memory allocation.
function releasePreview(elem) {
  const old = previewURLs.get(elem);
  if (old) URL.revokeObjectURL(old);
  previewURLs.delete(elem);
}
function showFilePreview(file, elem) {
  if (!file || !elem) return;
  releasePreview(elem);
  const url = URL.createObjectURL(file);
  previewURLs.set(elem, url);
  elem.src = url;
}
function clearInputWithError(input, reason) {
  if (input) input.value = "";
  showToast(reason);
}
function decodeImage(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () =>
      resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read this image"));
    };
    image.src = url;
  });
}
async function validateCoverDimensionsPromise(file) {
  if (!file) return { ok: true };
  try {
    const { image, release } = await decodeImage(file);
    const result = {
      ok: image.naturalWidth >= image.naturalHeight,
      w: image.naturalWidth,
      h: image.naturalHeight,
    };
    release();
    return result;
  } catch {
    return { ok: false };
  }
}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image conversion failed")),
      type,
      quality,
    );
  });
}
// Resize on the client, prevent upscaling, and use WebP when the browser supports it.
// For vCard photos, explicitly request JPEG for better contact-app compatibility.
async function convertImage(
  file,
  { maxWidth, maxHeight, quality = 0.78, type = "image/webp" },
) {
  const { image, release } = await decodeImage(file);
  try {
    const ratio = Math.min(
      1,
      maxWidth / image.naturalWidth,
      maxHeight / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    if (type === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasBlob(canvas, type, quality);
    const actualType = blob.type || "image/png";
    const ext =
      actualType === "image/webp"
        ? ".webp"
        : actualType === "image/jpeg"
          ? ".jpg"
          : ".png";
    const name = (file.name || "image").replace(/\.[^.]+$/, "") + ext;
    return new File([blob], name, {
      type: actualType,
      lastModified: Date.now(),
    });
  } finally {
    release();
  }
}
async function prepareProfilePhoto(file) {
  return file
    ? convertImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.8 })
    : null;
}
async function optimizeCoverImage(file) {
  if (!file) return null;
  const { image, release } = await decodeImage(file);
  const square = image.naturalWidth === image.naturalHeight;
  release();
  return convertImage(file, {
    maxWidth: square ? 512 : 624,
    maxHeight: square ? 512 : 624,
    quality: 0.8,
  });
}
async function compressImage(file, max = 1200, quality = 0.75) {
  return convertImage(file, { maxWidth: max, maxHeight: max, quality });
}
async function uploadImage(folder, id, uid, file) {
  if (!file) return null;
  // Keep the original Storage folder and object naming scheme unchanged.
  const storageRef = ref(storage, `${folder}/${id}/${uid}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
const uploadProfilePhoto = (id, uid, file) =>
  uploadImage("profile_photos", id, uid, file);
const uploadCoverImage = (id, uid, file) =>
  uploadImage("cover_images", id, uid, file);

function bindImageInput(
  inputId,
  previewId,
  { cover = false, hideOverlay = false } = {},
) {
  const input = $(inputId);
  const preview = $(previewId);
  if (!input || !preview) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.ok) {
      clearInputWithError(input, validation.reason);
      return;
    }
    if (cover) {
      const dimensions = await validateCoverDimensionsPromise(file);
      // Ignore a stale validation result if the user selected a different file.
      if (input.files?.[0] !== file) return;
      if (!dimensions.ok) {
        clearInputWithError(
          input,
          `Cover must be square or landscape (uploaded: ${dimensions.w ?? "?"}×${dimensions.h ?? "?"})`,
        );
        return;
      }
    }
    showFilePreview(file, preview);
    if (hideOverlay) {
      const overlay = document.querySelector(".upload-overlay");
      if (overlay) overlay.style.display = "none";
    }
  });
}
function bindPasswordToggle(buttonId, inputId) {
  const button = $(buttonId);
  const input = $(inputId);
  if (!button || !input) return;
  button.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    button.classList.toggle("fa-eye-slash");
    button.classList.toggle("slash");
    button.classList.add("blink");
    setTimeout(() => button.classList.remove("blink"), 200);
  });
}
async function checkAllowedId() {
  return (await getDoc(doc(db, "allowedUIDs", nfcId))).exists();
}
async function getProfile() {
  const snap = await getDoc(userRef());
  return snap.exists() ? snap.data() : null;
}
function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const str = value.trim();
  const url = /^https?:\/\//i.test(str) ? str : `https://${str}`;
  try {
    return ["http:", "https:"].includes(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}
function toggleContact(id, value, type) {
  const elem = $(id);
  if (!elem) return;
  const v = typeof value === "string" ? value.trim() : "";
  elem.style.display = v ? "flex" : "none";
  elem.onclick = null;
  if (!v) {
    delete elem.dataset.value;
    return;
  }
  elem.dataset.value = v; // Real value used by .vcf; visible labels are not contact values.
  const label = elem.querySelector(".contact-text");
  if (label)
    label.textContent =
      { email: "Email", phone: "Call", website: "Website" }[type] ?? v;
  if (type === "email")
    elem.onclick = () => {
      location.href = `mailto:${v}`;
    };
  if (type === "phone")
    elem.onclick = () => {
      location.href = `tel:${v}`;
    };
  if (type === "website")
    elem.onclick = () => {
      const link = normalizeUrl(v);
      if (link) window.open(link, "_blank", "noopener,noreferrer");
    };
}
function renderProfile(data) {
  activeProfile = data;
  display("profileDiv", "block");
  setText("profileName", data.name || "");
  setText("profilePosition", data.position || "");
  setText("profileAboutMe", data.aboutMe?.trim() || "");
  const aboutCard = document.querySelector(".about-me-card");
  if (aboutCard)
    aboutCard.style.display = data.aboutMe?.trim() ? "flex" : "none";
  setImage("profilePhoto", data.photoUrl || DEFAULT_PHOTO);
  setImage("profileCoverImage", data.coverUrl || DEFAULT_COVER);
  toggleContact("profileEmail", data.email, "email");
  toggleContact("profilePhone", data.socials?.phone, "phone");
  toggleContact("profileWebsite", data.socials?.website, "website");
  for (const key of PROFILE_SOCIALS) {
    const elem = $(`${key}Link`);
    if (!elem) continue;
    const url = normalizeUrl(data.socials?.[key]);
    elem.style.display = url ? "inline-flex" : "none";
    if (url) elem.href = url;
    else elem.removeAttribute("href");
  }
  const socialRow = document.querySelector(".social-row");
  if (socialRow)
    socialRow.style.display = PROFILE_SOCIALS.some((key) =>
      normalizeUrl(data.socials?.[key]),
    )
      ? "flex"
      : "none";
  renderPublicGallery(data.productImages || []);
}
async function loadProfile() {
  for (const id of [
    "registrationDiv",
    "editDiv",
    "profileDiv",
    "galleryCarousel",
    "loginDiv",
  ])
    display(id, "none");
  if (!nfcId) {
    if (onPage("krafty-login")) display("loginDiv", "block");
    else showToast("Missing NFC ID.");
    hideLoader();
    return;
  }
  showLoader();
  try {
    if (!(await checkAllowedId())) {
      alert("This NFC ID is not registered in allowedUIDs.");
      go("krafty-login.html");
      return;
    }
    const data = await getProfile();
    if (!data) {
      if (onPage("krafty-register")) display("registrationDiv", "block");
      else go(registerURL());
    } else if (onPage("krafty-profile")) {
      renderProfile(data);
    } else if (onPage("krafty-login")) {
      display("loginDiv", "block");
    } else if (onPage("krafty-register")) {
      // Existing account: preserve original registration-page behavior (no registration form).
      showToast("This NFC ID is already registered.");
    }
  } catch (error) {
    console.error("loadProfile:", error);
    showToast("Error loading profile: " + error.message);
    if (onPage("krafty-login")) display("loginDiv", "block");
  } finally {
    hideLoader();
  }
}

// ---------------- Registration ----------------
function initRegisterPage() {
  if (!onPage("krafty-register.html")) return;
  bindImageInput("regPhoto", "photoPreview", { hideOverlay: true });
  bindImageInput("regCover", "regCoverPreview", { cover: true });
  bindPasswordToggle("togglePassword", "regPassword");
  const save = $("regSaveBtn");
  save?.addEventListener("click", async () => {
    if (save.disabled || !requireId()) return;
    const name = getValue("regName");
    const email = getValue("regEmail");
    const password = getValue("regPassword");
    const missing = [
      !name && "Name",
      !email && "Email",
      !password && "Password",
    ].filter(Boolean);
    if (missing.length) {
      showToast(
        `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`,
      );
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Enter a valid email");
      return;
    }
    const photo = $("regPhoto")?.files?.[0];
    const cover = $("regCover")?.files?.[0];
    for (const file of [photo, cover]) {
      const validation = validateImageFile(file);
      if (!validation.ok) {
        showToast(validation.reason);
        return;
      }
    }
    if (cover && !(await validateCoverDimensionsPromise(cover)).ok) {
      showToast("Cover must be square or landscape");
      return;
    }
    save.disabled = true;
    showLoader();
    let createdUser = null;
    try {
      // Avoid creating Firebase Auth accounts for invalid or already-used card IDs.
      if (!(await checkAllowedId()))
        throw new Error("This NFC ID is not registered.");
      if (await getProfile())
        throw new Error("This NFC ID already has a profile.");
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      createdUser = credential.user;
      let photoUrl = DEFAULT_PHOTO;
      let coverUrl = DEFAULT_COVER;
      if (photo) {
        try {
          photoUrl = await uploadProfilePhoto(
            nfcId,
            createdUser.uid,
            await prepareProfilePhoto(photo),
          );
        } catch (error) {
          console.error("Profile photo upload failed:", error);
          showToast("Profile photo upload failed; registering without it.");
        }
      }
      if (cover) {
        try {
          coverUrl = await uploadCoverImage(
            nfcId,
            createdUser.uid,
            await optimizeCoverImage(cover),
          );
        } catch (error) {
          console.error("Cover upload failed:", error);
          showToast("Cover upload failed; registering without it.");
        }
      }
      await setDoc(userRef(), {
        name,
        position: getValue("regPosition"),
        aboutMe: getValue("regAboutMe"),
        email,
        photoUrl,
        coverUrl,
        socials: {
          phone: getValue("regPhone"),
          website: getValue("regWebsite"),
          facebook: getValue("regFacebook"),
          instagram: getValue("regInstagram"),
          tiktok: getValue("regTikTok"),
          linkedin: getValue("regLinkedin"),
        },
        authUid: createdUser.uid,
      });
      showToast("Profile registered!");
      go(profileURL());
    } catch (error) {
      console.error("Registration error:", error);
      showToast("Error: " + error.message, 5000);
      if (createdUser) {
        try {
          if (auth.currentUser?.uid === createdUser.uid)
            await createdUser.delete();
        } catch (rollbackError) {
          console.warn("Registration rollback failed:", rollbackError);
        }
      }
    } finally {
      save.disabled = false;
      hideLoader();
    }
  });
  loadProfile();
}

// ---------------- Login ----------------
function initLoginPage() {
  if (!onPage("krafty-login.html")) return;
  bindPasswordToggle("toggleLoginPassword", "loginPassword");
  $("logoutBtn")?.addEventListener("click", () =>
    go(nfcId ? profileURL() : "krafty-profile.html"),
  );
  const login = $("loginBtn");
  login?.addEventListener("click", async () => {
    if (login.disabled) return;
    const email = getValue("loginEmail");
    const password = $("loginPassword")?.value || "";
    if (!email || !password) {
      showToast("Email and password required");
      return;
    }
    if (!requireId()) return;
    login.disabled = true;
    showLoader();
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const profile = await getProfile();
      if (!profile) throw new Error("No profile for this NFC ID");
      if (profile.authUid !== user.uid)
        throw new Error("Not authorized for this NFC ID");
      go(editURL());
    } catch (error) {
      console.error("Login failed:", error);
      showToast("Login failed: " + error.message, 4000);
    } finally {
      login.disabled = false;
      hideLoader();
    }
  });
  loadProfile();
}

// ---------------- Edit profile and product gallery ----------------
function fillEditForm(data) {
  for (const [field, value] of Object.entries({
    editName: data.name,
    editPosition: data.position,
    editAboutMe: data.aboutMe,
    editPhone: data.socials?.phone,
    editWebsite: data.socials?.website,
    editFacebook: data.socials?.facebook,
    editInstagram: data.socials?.instagram,
    editTikTok: data.socials?.tiktok,
    editLinkedin: data.socials?.linkedin,
  }))
    setValue(field, value);
  setImage("editPhotoPreview", data.photoUrl || DEFAULT_PHOTO);
  setImage("editCoverPreview", data.coverUrl || "images/KraftyMain.png");
}
function resetGalleryState(images) {
  for (const item of newImages)
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  existingImages = images.map((image) => ({ ...image }));
  newImages = [];
  deletedImages = [];
  hasUnsavedChanges = false;
  renderGallery();
}
function renderGallery() {
  const preview = $("galleryPreview");
  const counter = $("galleryCounter");
  if (!preview || !counter) return;
  const total = existingImages.length + newImages.length;
  preview.style.display = total ? "grid" : "none";
  preview.replaceChildren();
  const createTile = (item, index, isNew) => {
    const tile = document.createElement("div");
    tile.className = "gallery-item";
    const image = document.createElement("img");
    image.src = isNew ? item.previewUrl : item.url;
    image.alt = item.caption || "Gallery image";
    image.loading = "lazy";
    image.decoding = "async";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "gallery-delete";
    del.textContent = "×";
    del.setAttribute("aria-label", "Remove image");
    del.addEventListener("click", () => {
      hasUnsavedChanges = true;
      if (isNew) {
        const [removed] = newImages.splice(index, 1);
        if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      } else {
        const [removed] = existingImages.splice(index, 1);
        deletedImages.push(removed);
      }
      renderGallery();
    });
    const caption = document.createElement("input");
    caption.placeholder = "Caption";
    caption.value = item.caption || "";
    caption.addEventListener("input", () => {
      item.caption = caption.value;
      hasUnsavedChanges = true;
    });
    tile.append(image, del, caption);
    return tile;
  };
  const fragment = document.createDocumentFragment();
  existingImages.forEach((item, index) =>
    fragment.appendChild(createTile(item, index, false)),
  );
  newImages.forEach((item, index) =>
    fragment.appendChild(createTile(item, index, true)),
  );
  preview.appendChild(fragment);
  counter.textContent = `${total} / ${MAX_GALLERY} images used`;
}
function bindGalleryInput() {
  const input = $("editGallery");
  if (!input) return;
  input.addEventListener("change", async () => {
    const available = MAX_GALLERY - existingImages.length - newImages.length;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!available) {
      showToast("Maximum of 5 gallery images.");
      return;
    }
    if (files.length > available)
      showToast(`Only ${available} additional image(s) can be added.`);
    for (const file of files.slice(0, available)) {
      const validation = validateImageFile(file);
      if (!validation.ok) {
        showToast(validation.reason);
        continue;
      }
      try {
        const converted = await compressImage(file);
        newImages.push({
          file: converted,
          caption: "",
          previewUrl: URL.createObjectURL(converted),
        });
        hasUnsavedChanges = true;
      } catch (error) {
        console.error("Gallery image conversion:", error);
        showToast("Could not process " + file.name);
      }
    }
    renderGallery();
  });
}
function bindAccordion() {
  const button = $("galleryAccordionToggle");
  const body = $("galleryAccordionBody");
  const accordion = document.querySelector(".accordion");
  if (!button || !body || !accordion) return;
  button.addEventListener("click", () => {
    const open = accordion.classList.contains("open");
    body.style.height = `${body.scrollHeight}px`;
    void body.offsetHeight; // force layout for height transition
    if (open) {
      body.style.height = "0px";
      accordion.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    } else {
      body.style.height = "0px";
      accordion.classList.add("open");
      button.setAttribute("aria-expanded", "true");
      void body.offsetHeight;
      body.style.height = `${body.scrollHeight}px`;
      body.addEventListener(
        "transitionend",
        () => {
          if (accordion.classList.contains("open")) body.style.height = "auto";
        },
        { once: true },
      );
    }
  });
}
function uniqueImageName(uid) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${uid}_${suffix}`;
}
function bindEditSave() {
  const save = $("editSaveBtn");
  if (!save) return;
  save.addEventListener("click", async () => {
    if (save.disabled) return;
    const user = auth.currentUser;
    if (!user) {
      go(loginURL());
      return;
    }
    save.disabled = true;
    showLoader();
    const uploadedPaths = [];
    let firestoreCommitted = false;
    try {
      const original = await getProfile();
      if (!original) throw new Error("Profile not found");
      if (original.authUid !== user.uid) throw new Error("Not authorized");
      const photoFile = $("editPhoto")?.files?.[0];
      const coverFile = $("editCover")?.files?.[0];
      for (const file of [photoFile, coverFile]) {
        const validation = validateImageFile(file);
        if (!validation.ok) throw new Error(validation.reason);
      }
      if (coverFile && !(await validateCoverDimensionsPromise(coverFile)).ok) {
        throw new Error("Cover must be square or landscape");
      }
      let photoUrl = original.photoUrl || DEFAULT_PHOTO;
      let coverUrl = original.coverUrl || "images/KraftyMain.png";
      if (photoFile)
        photoUrl = await uploadProfilePhoto(
          nfcId,
          user.uid,
          await prepareProfilePhoto(photoFile),
        );
      if (coverFile)
        coverUrl = await uploadCoverImage(
          nfcId,
          user.uid,
          await optimizeCoverImage(coverFile),
        );
      // Upload first, then update Firestore. Delete old objects only after Firestore succeeds.
      const uploaded = [];
      for (const item of newImages) {
        const path = `gallery/${nfcId}/${user.uid}/${uniqueImageName(user.uid)}`;
        const imageRef = ref(storage, path);
        await uploadBytes(imageRef, item.file, { contentType: item.file.type });
        uploadedPaths.push(path);
        const url = await getDownloadURL(imageRef);
        uploaded.push({ path, url, caption: item.caption || "" });
      }
      const productImages = [...existingImages, ...uploaded];
      const updated = {
        name: getValue("editName"),
        position: getValue("editPosition"),
        aboutMe: getValue("editAboutMe"),
        email: original.email || user.email || "",
        photoUrl,
        coverUrl,
        socials: {
          phone: getValue("editPhone"),
          website: getValue("editWebsite"),
          facebook: getValue("editFacebook"),
          instagram: getValue("editInstagram"),
          tiktok: getValue("editTikTok"),
          linkedin: getValue("editLinkedin"),
        },
        productImages,
        authUid: user.uid,
      };
      await setDoc(userRef(), updated); // Existing Firestore schema is unchanged.
      firestoreCommitted = true;
      for (const oldImage of deletedImages) {
        if (!oldImage.path) continue;
        try {
          await deleteObject(ref(storage, oldImage.path));
        } catch (error) {
          console.warn("Gallery cleanup failed:", error);
        }
      }
      hasUnsavedChanges = false;
      showToast("Profile updated!");
      go(profileURL());
    } catch (error) {
      console.error("Profile update failed:", error);
      // Remove newly-uploaded gallery objects only if Firestore was not updated.
      if (!firestoreCommitted && uploadedPaths.length) {
        await Promise.allSettled(
          uploadedPaths.map((path) => deleteObject(ref(storage, path))),
        );
      }
      showToast("Update error: " + (error.message || error.code), 5000);
    } finally {
      save.disabled = false;
      hideLoader();
    }
  });
}
function bindEditControls() {
  bindImageInput("editPhoto", "editPhotoPreview");
  bindImageInput("editCover", "editCoverPreview", { cover: true });
  bindAccordion();
  bindGalleryInput();
  bindEditSave();
  $("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      go(profileURL());
    } catch (error) {
      console.error("Logout failed:", error);
    }
  });
}
function initEditPage() {
  if (!onPage("krafty-edit.html")) return;
  display("editDiv", "none");
  if (!nfcId) {
    go("krafty-login.html");
    return;
  }
  showLoader();
  let initialized = false;
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      go(loginURL());
      return;
    }
    try {
      const profile = await getProfile();
      if (!profile || profile.authUid !== user.uid) {
        go(loginURL());
        return;
      }
      if (!initialized) {
        initialized = true;
        fillEditForm(profile);
        resetGalleryState(profile.productImages || []);
        bindEditControls(); // Attach all listeners once.
      }
      display("editDiv", "block");
      hideLoader();
    } catch (error) {
      console.error("Edit authorization failed:", error);
      go(loginURL());
    }
  });
}

// ---------------- Public gallery ----------------
function renderPublicGallery(images) {
  const carousel = $("galleryCarousel");
  const swiperElem = document.querySelector(".gallery-swiper");
  const wrapper = $("galleryWrapper");
  if (!carousel || !swiperElem || !wrapper) return;
  swiperInstance?.destroy?.(true, true);
  swiperInstance = null;
  wrapper.replaceChildren();
  let count = 0;
  const fragment = document.createDocumentFragment();
  for (const item of images) {
    if (!item?.url) continue;
    const slide = document.createElement("div");
    slide.className = "swiper-slide";
    const frame = document.createElement("div");
    frame.className = "image-frame";
    const image = document.createElement("img");
    image.src = item.url; // DOM property instead of interpolated HTML.
    image.alt = item.caption || "Product image";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("click", () => openViewer(image.src));
    frame.append(image);
    slide.append(frame);
    fragment.append(slide);
    count++;
  }
  wrapper.append(fragment);
  carousel.style.display = count ? "block" : "none";
  swiperElem.style.display = count ? "block" : "none";
  if (count && typeof window.Swiper === "function") {
    swiperInstance = new window.Swiper(".gallery-swiper", {
      slidesPerView: "auto",
      spaceBetween: 16,
      pagination: {
        el: ".swiper-pagination",
        type: "bullets",
        clickable: true,
      },
    });
  }
}
function openViewer(src) {
  const overlay = document.createElement("div");
  overlay.className = "image-viewer";
  const image = document.createElement("img");
  image.src = src;
  image.alt = "Gallery image, enlarged";
  overlay.append(image);
  overlay.addEventListener("click", () => overlay.remove());
  document.body.append(overlay);
}

// ---------------- vCard: source values, JPEG contact photo, RFC folding ----------------
const escapeVCard = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function foldedVCardLine(line) {
  // Fold at 75 UTF-8 octets per physical line (continuation space counts).
  const encoder = new TextEncoder();
  const parts = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (currentBytes + length > 75) {
      parts.push(current);
      current = " ";
      currentBytes = 1;
    }
    current += char;
    currentBytes += length;
  }
  parts.push(current);
  return parts.join("\r\n");
}
function buildN(fullName) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() || "";
  return `${escapeVCard(parts.join(" "))};${escapeVCard(first)};;;`;
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(new Error("Could not encode photo"));
    reader.readAsDataURL(blob);
  });
}
async function getVCardPhoto(photoUrl) {
  if (!photoUrl || photoUrl.includes(DEFAULT_PHOTO)) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const proxiedURL = `${PHOTO_PROXY}?url=${encodeURIComponent(photoUrl)}`;
    const response = await fetch(proxiedURL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
    const blob = await response.blob();
    // Decode the bytes rather than trusting Content-Type (some proxies return octet-stream).
    const jpeg = await convertImage(blob, {
      maxWidth: 512,
      maxHeight: 512,
      quality: 0.85,
      type: "image/jpeg",
    });
    return blobToBase64(jpeg);
  } catch (error) {
    console.warn(
      "Photo embedding unavailable; saving contact with image URL:",
      error,
    );
    return "";
  } finally {
    clearTimeout(timer);
  }
}
async function downloadContact() {
  if (!activeProfile || $("profileDiv")?.style.display === "none") {
    showToast("Profile not loaded yet.");
    return;
  }
  const data = activeProfile;
  const name = (data.name || "").trim();
  const position = data.position || "";
  const email = data.email || "";
  const phone = data.socials?.phone || "";
  const website = normalizeUrl(data.socials?.website);
  const photoUrl = $("profilePhoto")?.src || data.photoUrl || "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${buildN(name)}`,
    `FN:${escapeVCard(name)}`,
  ];
  if (position) lines.push(`TITLE:${escapeVCard(position)}`);
  if (email) lines.push(`EMAIL;TYPE=WORK:${escapeVCard(email)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(phone)}`);
  if (website) lines.push(`URL:${escapeVCard(website)}`);
  for (const key of PROFILE_SOCIALS) {
    const url = normalizeUrl(data.socials?.[key]);
    if (url)
      lines.push(
        `X-SOCIALPROFILE;TYPE=${{ facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn" }[key]}:${escapeVCard(url)}`,
      );
  }
  const photo = await getVCardPhoto(photoUrl);
  if (photo) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photo}`);
  else if (photoUrl && !photoUrl.includes(DEFAULT_PHOTO))
    lines.push(`PHOTO;VALUE=URI:${escapeVCard(photoUrl)}`);
  lines.push("END:VCARD");
  const content = lines.map(foldedVCardLine).join("\r\n") + "\r\n";
  const blob = new Blob([content], { type: "text/vcard;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${(name || "contact").replace(/[^a-z0-9 _-]/gi, "").replace(/\s+/g, "_") || "contact"}.vcf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
function initProfilePage() {
  if (!onPage("krafty-profile.html")) return;
  $("loginEditBtn")?.addEventListener("click", () => go(loginURL()));
  const saveContact = $("saveContactBtn");
  saveContact?.addEventListener("click", async () => {
    if (saveContact.disabled) return;
    saveContact.disabled = true;
    try {
      await downloadContact();
    } catch (error) {
      console.error("vCard creation failed:", error);
      showToast("Could not save contact.");
    } finally {
      saveContact.disabled = false;
    }
  });
  $("logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      go(profileURL());
    } catch (error) {
      console.error("Logout failed:", error);
    }
  });
  loadProfile();
}
function init() {
  initRegisterPage();
  initLoginPage();
  initEditPage();
  initProfilePage();
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
