// The merged chat pane. It overlays the native Kick message list inside the same
// chat column (Kick's list is a virtualized, absolutely-positioned stack, so
// interleaving rows into it directly is not stable). Kick's header, emote
// picker and message input stay untouched and usable.
(() => {
  const KTW = (window.KTW = window.KTW || {});

  class ChatPane {
    constructor({ onNativeModeChange, onAppearanceChange }) {
      this.onNativeModeChange = onNativeModeChange || (() => {});
      this.onAppearanceChange = onAppearanceChange || (() => {});
      this.native = false;
      this.following = true;
      this.seen = new Set();
      this.seenQueue = [];
      this.maxRows = 350;
      this.hardMaxRows = 800;
      this.badgeMap = {};
      this.root = this.build();
    }

    build() {
      const root = document.createElement("div");
      root.id = "ktw-pane";
      root.dataset.ktw = "1";

      const bar = document.createElement("div");
      bar.className = "ktw-bar";

      const kickStatus = document.createElement("span");
      kickStatus.className = "ktw-status";
      kickStatus.dataset.who = "kick";
      kickStatus.title = "Kick chat connection";
      kickStatus.appendChild(this.dot());
      kickStatus.appendChild(document.createTextNode("Kick"));
      bar.appendChild(kickStatus);

      const divider = document.createElement("span");
      divider.className = "ktw-bar-divider";
      divider.textContent = "+";
      bar.appendChild(divider);

      const twitchStatus = document.createElement("span");
      twitchStatus.className = "ktw-status";
      twitchStatus.dataset.who = "twitch";
      twitchStatus.title = "Twitch chat connection";
      twitchStatus.appendChild(this.dot());
      const icon = document.createElement("span");
      icon.className = "ktw-bar-twitch-icon";
      icon.innerHTML =
        '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>';
      twitchStatus.appendChild(icon);
      const twitchLink = document.createElement("a");
      twitchLink.className = "ktw-channel";
      twitchLink.target = "_blank";
      twitchLink.rel = "noreferrer noopener";
      twitchLink.title = "Open this channel on Twitch";
      twitchLink.textContent = "twitch";
      twitchStatus.appendChild(twitchLink);
      this.twitchLink = twitchLink;
      bar.appendChild(twitchStatus);

      const spacer = document.createElement("span");
      spacer.className = "ktw-spacer";
      bar.appendChild(spacer);

      const settings = document.createElement("button");
      settings.type = "button";
      settings.className = "ktw-settings-btn";
      settings.title = "Chat display settings";
      settings.setAttribute("aria-label", "Chat display settings");
      settings.innerHTML =
        '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path fill="currentColor" d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm0 1.8a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z"/><path fill="currentColor" d="M10.6 2h2.8l.5 2.1c.5.2 1 .4 1.4.7l2-.8 1.4 2.4-1.6 1.5c.1.5.1 1.1 0 1.6l1.6 1.5-1.4 2.4-2-.8c-.4.3-.9.5-1.4.7l-.5 2.1h-2.8l-.5-2.1c-.5-.2-1-.4-1.4-.7l-2 .8-1.4-2.4 1.6-1.5a5.6 5.6 0 0 1 0-1.6L5.3 6.4l1.4-2.4 2 .8c.4-.3.9-.5 1.4-.7l.5-2.1Zm1.4 1.8-.3 1.4c-.8.2-1.5.5-2.1 1l-1.4-.5-.4.7 1.1 1c-.3.7-.4 1.4-.3 2.2l-1.2 1.1.4.7 1.5-.5c.5.5 1.2.9 1.9 1.1l.3 1.4h.8l.3-1.4c.8-.2 1.4-.6 1.9-1.1l1.5.5.4-.7-1.2-1.1c.1-.8 0-1.5-.3-2.2l1.1-1-.4-.7-1.4.5a5.4 5.4 0 0 0-2.1-1l-.3-1.4h-.8Z"/></svg>';
      const menu = document.createElement("div");
      menu.className = "ktw-menu";
      menu.hidden = true;
      menu.innerHTML = `
        <label><input type="checkbox" data-setting="showTimestamps"> Timestamps</label>
        <label><input type="checkbox" data-setting="showBadges"> Badges</label>
        <label><input type="checkbox" data-setting="tintTwitch"> Twitch tint</label>
        <label><input type="checkbox" data-setting="tintKick"> Kick tint</label>
        <label><input type="checkbox" data-setting="colorBar"> Color bar</label>
        <label><input type="checkbox" data-setting="kickIcon"> Kick icon</label>`;
      this.menu = menu;
      this.settingsButton = settings;
      settings.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
      });
      menu.addEventListener("click", (event) => event.stopPropagation());
      menu.addEventListener("change", (event) => {
        const input = event.target.closest("input[data-setting]");
        if (!input) return;
        this.onAppearanceChange({ [input.dataset.setting]: input.checked });
      });
      this._docClick = () => {
        menu.hidden = true;
      };
      document.addEventListener("click", this._docClick);
      bar.appendChild(settings);
      bar.appendChild(menu);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ktw-toggle";
      toggle.textContent = "Native";
      toggle.title = "Show Kick's original chat list instead of the merged list";
      toggle.addEventListener("click", () => {
        this.setNativeMode(!this.native);
        this.onNativeModeChange(this.native);
      });
      this.toggle = toggle;
      bar.appendChild(toggle);

      const list = document.createElement("div");
      list.className = "ktw-list";
      list.setAttribute("role", "log");
      list.setAttribute("aria-live", "polite");
      list.setAttribute("aria-relevant", "additions");
      list.addEventListener("scroll", () => this.updateScrollState(), { passive: true });
      this.list = list;

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "ktw-jump";
      jump.hidden = true;
      jump.textContent = "Jump to latest";
      jump.addEventListener("click", () => this.scrollToBottom(true));
      this.jump = jump;

      root.appendChild(bar);
      root.appendChild(list);
      root.appendChild(jump);
      return root;
    }

    dot() {
      const dot = document.createElement("span");
      dot.className = "ktw-dot";
      return dot;
    }

    mount(host) {
      if (!host) return false;
      // Kick can briefly keep stale chat DOM around during client-side
      // navigation. Never leave a second pane behind.
      for (const stray of document.querySelectorAll("#ktw-pane")) {
        if (stray !== this.root) stray.remove();
      }
      const moved = this.root.parentElement !== host;
      if (moved) host.appendChild(this.root);
      this.host = host;
      if (moved) {
        requestAnimationFrame(() => {
          if (this.following) this.scrollToBottom(false);
        });
      }
      return true;
    }

    unmount() {
      if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
      if (this._docClick) document.removeEventListener("click", this._docClick);
      this._docClick = null;
      this.host = null;
    }

    get mounted() {
      return this.root.isConnected;
    }

    setChannel({ kickSlug, twitchSlug }) {
      if (this.twitchLink) {
        this.twitchLink.textContent = twitchSlug ? `#${twitchSlug}` : "not linked";
        if (twitchSlug) {
          this.twitchLink.href = `https://www.twitch.tv/${encodeURIComponent(twitchSlug)}`;
        } else {
          this.twitchLink.removeAttribute("href");
        }
      }
      const kick = this.root.querySelector('.ktw-status[data-who="kick"]');
      if (kick) kick.title = kickSlug ? `Kick chat: #${kickSlug}` : "Kick chat";
    }

    setStatus(who, state, detail) {
      const node = this.root.querySelector(`.ktw-status[data-who="${who}"]`);
      if (!node) return;
      node.dataset.state = state;
      node.title = detail ? `${who}: ${state} — ${detail}` : `${who}: ${state}`;
    }

    setNativeMode(native) {
      this.native = Boolean(native);
      this.root.classList.toggle("ktw-native", this.native);
      this.toggle.textContent = this.native ? "Merged" : "Native";
      this.toggle.title = this.native
        ? "Show the merged Kick + Twitch list"
        : "Show Kick's original chat list instead of the merged list";
      if (!this.native) this.scrollToBottom(false);
    }

    setAppearance({ showTimestamps, showBadges, tintTwitch, tintKick, colorBar, kickIcon, kickBadges }) {
      this.root.classList.toggle("ktw-no-ts", !showTimestamps);
      this.root.classList.toggle("ktw-no-badges", !showBadges);
      this.root.classList.toggle("ktw-tint-twitch", Boolean(tintTwitch));
      this.root.classList.toggle("ktw-tint-kick", Boolean(tintKick));
      this.root.classList.toggle("ktw-color-bar", colorBar !== false);
      this.root.classList.toggle("ktw-hide-kick-badges", kickBadges === false);
      this.root.classList.toggle("ktw-hide-kick-icon", kickIcon === false);
      const sync = (setting, value) => {
        const input = this.menu && this.menu.querySelector(`input[data-setting="${setting}"]`);
        if (input) input.checked = Boolean(value);
      };
      sync("showTimestamps", showTimestamps);
      sync("showBadges", showBadges);
      sync("tintTwitch", tintTwitch);
      sync("tintKick", tintKick);
      sync("colorBar", colorBar);
      sync("kickIcon", kickIcon);
    }

    setBadgeMap(map) {
      KTW.setTwitchBadges(map);
    }

    isNearBottom() {
      const list = this.list;
      return list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    }

    updateScrollState() {
      const near = this.isNearBottom();
      this.following = near;
      this.jump.hidden = near;
    }

    scrollToBottom(smooth) {
      const list = this.list;
      this.following = true;
      list.scrollTo({ top: list.scrollHeight, behavior: smooth ? "smooth" : "auto" });
      this.jump.hidden = true;
    }

    key(msg) {
      return `${msg.src}:${msg.id}`;
    }

    remember(key) {
      if (this.seen.has(key)) return false;
      this.seen.add(key);
      this.seenQueue.push(key);
      if (this.seenQueue.length > 4000) {
        const drop = this.seenQueue.splice(0, 1000);
        for (const old of drop) this.seen.delete(old);
      }
      return true;
    }

    appendMessage(msg, settings) {
      if (msg.id && !this.remember(this.key(msg))) return;
      const row = KTW.buildMessageRow(msg, settings);
      row.__ktwMsg = msg;
      this.list.appendChild(row);
      this.trim();
    }

    add(msg, settings) {
      const stick = this.following;
      this.appendMessage(msg, settings);
      if (stick) this.scrollToBottom(false);
      else this.updateScrollState();
    }

    addMany(messages, settings) {
      if (!messages.length) return;
      const stick = this.following;
      const fragment = document.createDocumentFragment();
      for (const msg of messages) {
        if (msg.id && !this.remember(this.key(msg))) continue;
        const row = KTW.buildMessageRow(msg, settings);
        row.__ktwMsg = msg;
        fragment.appendChild(row);
      }
      this.list.appendChild(fragment);
      this.trim();
      if (stick) this.scrollToBottom(false);
      else this.updateScrollState();
    }

    system(entry) {
      const stick = this.following;
      this.list.appendChild(KTW.buildSystemRow(entry));
      this.trim();
      if (stick) this.scrollToBottom(false);
    }

    clearSource(src) {
      for (const row of this.list.querySelectorAll(`.ktw-row[data-src="${src}"]`)) {
        row.remove();
      }
      this.updateScrollState();
    }

    removeMessage(src, id) {
      if (!id) return;
      const row = this.list.querySelector(
        `.ktw-row[data-src="${src}"][data-msg-id="${CSS.escape(String(id))}"]`,
      );
      if (row) row.remove();
    }

    removeUser(src, user) {
      if (!user) return;
      const wanted = String(user).toLowerCase();
      for (const row of this.list.querySelectorAll(`.ktw-row[data-src="${src}"]`)) {
        const link = row.querySelector(".ktw-user");
        if (!link) continue;
        const text = link.textContent.toLowerCase();
        const href = (link.getAttribute("href") || "").toLowerCase();
        if (text === wanted || href.endsWith("/" + wanted)) row.remove();
      }
    }

    refreshEmotes() {
      if (!KTW.renderMessageText) return;
      const stick = this.following;
      for (const row of this.list.querySelectorAll(".ktw-row[data-msg-id]")) {
        const msg = row.__ktwMsg;
        const text = row.querySelector(".ktw-text");
        if (!msg || !text) continue;
        text.textContent = "";
        text.appendChild(KTW.renderMessageText(msg));
      }
      if (stick) this.scrollToBottom(false);
    }

    reset() {
      this.list.textContent = "";
      this.seen.clear();
      this.seenQueue.length = 0;
      this.jump.hidden = true;
    }

    trim() {
      const count = this.list.childElementCount;
      if (count <= this.hardMaxRows) {
        if (count <= this.maxRows) return;
        if (!this.isNearBottom()) return;
      }
      const removeCount = count - this.maxRows;
      const stick = this.following;
      let removedHeight = 0;
      for (let i = 0; i < removeCount; i += 1) {
        const first = this.list.firstElementChild;
        if (!first) break;
        removedHeight += first.getBoundingClientRect().height;
        first.remove();
      }
      if (!stick) this.list.scrollTop = Math.max(0, this.list.scrollTop - removedHeight);
    }
  }

  KTW.ChatPane = ChatPane;
})();
