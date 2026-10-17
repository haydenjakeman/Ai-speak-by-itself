
import { pipeline, env } from
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";

env.allowRemoteModels = true;
env.allowLocalModels = false;

const MODEL = "HuggingFaceTB/SmolVLM2-500M-Video-Instruct";

const $ = id => document.getElementById(id);

const chat = $("chat");
const input = $("messageInput");
const sendBtn = $("sendBtn");
const downloadBtn = $("downloadBtn");
const status = $("status");
const progressBar = $("progressBar");
const progressText = $("progressText");
const photoInput = $("photoInput");
const photoPreview = $("photoPreview");

let ai = null;
let loading = false;
let photoData = null;
let photoUrl = null;
let speakingReplies = false;
let speakingAlone = false;
let autoTimer = null;
let history = [];

function addMessage(text, who = "pulse") {
  const div = document.createElement("div");
  div.className = "message " +
    (who === "user" ? "user-message" : "pulse-message");
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function setStatus(text) {
  status.textContent = text;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function downloadAI() {
  if (loading || ai) return;

  loading = true;
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Loading AI...";
  setStatus("Downloading AI model");

  try {
    ai = await pipeline("image-text-to-text", MODEL, {
      device: "webgpu",
      dtype: "q4",
      progress_callback: info => {
        if (typeof info.progress === "number") {
          const percent = Math.round(info.progress);
          progressBar.style.width = percent + "%";
          progressText.textContent =
            `${info.file || "Model file"}: ${percent}%`;
        }
      }
    });

    setStatus("AI ready");
    progressBar.style.width = "100%";
    progressText.textContent = "AI loaded successfully";
    downloadBtn.textContent = "AI Brain Ready";
    addMessage("My AI brain is ready! Ask me something.");
  } catch (error) {
    console.error(error);
    ai = null;

    setStatus("AI loading failed");
    progressText.textContent =
      "Could not load the model. Check internet and browser support.";
    downloadBtn.textContent = "Try Download Again";

    addMessage(
      "I couldn't load my AI brain. Try again with internet enabled. " +
      "If this keeps happening, your browser or device may not support this model."
    );
  } finally {
    loading = false;
    downloadBtn.disabled = false;
  }
}

async function generateReply(prompt, imageData = null) {
  if (!ai) {
    return "Please download my AI brain first.";
  }

  const content = [];

  if (imageData) {
    content.push({ type: "image", image: imageData });
  }

  content.push({ type: "text", text: prompt });

  const messages = [
    {
      role: "system",
      content: "You are Pulse, a friendly, curious AI assistant. " +
        "Be helpful, natural, and concise. Do not claim to see an image " +
        "unless image information is actually available."
    },
    ...history.slice(-6),
    { role: "user", content }
  ];

  const result = await ai(messages, {
    max_new_tokens: 120,
    do_sample: true,
    temperature: 0.7
  });

  let answer = result?.[0]?.generated_text;

  if (Array.isArray(answer)) {
    const last = answer[answer.length - 1];
    answer = typeof last === "string" ? last : last?.content;
  }

  if (typeof answer !== "string") {
    answer = "I couldn't create a reply. Please try again.";
  }

  return answer.trim();
}

async function sendMessage() {
  const text = input.value.trim();

  if (!text && !photoData) return;

  const imageForMessage = photoData;
  const photoForHistory = Boolean(imageForMessage);

  addMessage(
    (text || "What is in this picture?") +
    (photoForHistory ? " [Photo attached]" : ""),
    "user"
  );

  input.value = "";
  photoData = null;
  photoPreview.replaceChildren();

  sendBtn.disabled = true;
  const waiting = addMessage("Pulse is thinking...");

  try {
    const prompt = text || "Describe this picture.";
    const answer = await generateReply(prompt, imageForMessage);

    waiting.textContent = answer;

    history.push(
      { role: "user", content: prompt },
      { role: "assistant", content: answer }
    );

    if (speakingReplies) speak(answer);
  } catch (error) {
    console.error(error);
    waiting.textContent =
      "Sorry, something went wrong while generating a reply.";
  } finally {
    sendBtn.disabled = false;
    chat.scrollTop = chat.scrollHeight;
  }
}

downloadBtn.addEventListener("click", downloadAI);
sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", event => {
  if (event.key === "Enter") sendMessage();
});

$("photoBtn").addEventListener("click", () => {
  photoInput.click();
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  if (photoUrl) URL.revokeObjectURL(photoUrl);

  photoUrl = URL.createObjectURL(file);
  const reader = new FileReader();

  reader.onload = () => {
    photoData = reader.result;

    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = "Selected photo";

    photoPreview.replaceChildren(img);
  };

  reader.readAsDataURL(file);
});

$("voiceBtn").addEventListener("click", () => {
  speakingReplies = !speakingReplies;
  $("voiceBtn").textContent =
    `🔊 Speak replies: ${speakingReplies ? "On" : "Off"}`;

  if (!speakingReplies && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

$("autoBtn").addEventListener("click", () => {
  speakingAlone = !speakingAlone;

  $("autoBtn").textContent =
    `✨ Speak by itself: ${speakingAlone ? "On" : "Off"}`;

  clearInterval(autoTimer);

  if (speakingAlone) {
    const greeting = "I'm here! You can chat with me whenever you like.";
    addMessage(greeting);
    speak(greeting);

    autoTimer = setInterval(async () => {
      if (!ai || loading || sendBtn.disabled) return;

      try {
        const thought = await generateReply(
          "Say one short, friendly conversational thought to start a chat. " +
          "Do not pretend you have real-world experiences."
        );

        addMessage(thought);
        speak(thought);
      } catch (error) {
        console.error(error);
      }
    }, 120000);
  } else if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

$("clearBtn").addEventListener("click", () => {
  history = [];
  chat.replaceChildren();
  addMessage("Chat cleared. What would you like to talk about?");
});

setStatus("AI not downloaded");
