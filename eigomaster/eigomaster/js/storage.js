/* ============================================================
   storage.js — 永続化レイヤ（localStorage ラッパー）
   - すべての学習データを 1 つのキーに JSON で保存する。
   - スキーマバージョンを持ち、将来の構造変更にマイグレーションで対応する。
   - エクスポート/インポート（JSONダウンロード・読込）に対応する。
   - 破損耐性：読み込み失敗時は既定状態へ安全に復帰する。
   グローバル変数 `Storage` として公開する（ES Modules を使わず file:// でも動かすため）。
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 定数（マジックナンバー・文字列を集約） ---------- */
  var STORAGE_KEY = "eigomaster.state.v1"; // localStorage 上のキー
  var SCHEMA_VERSION = 1;                  // データ構造のバージョン
  var MS_PER_DAY = 24 * 60 * 60 * 1000;    // 1日のミリ秒
  var DAILY_GOAL_DEFAULT = 15;             // デイリーゴールの初期値（分）

  /* ---------- 既定状態（初回起動・破損時のフォールバック） ---------- */
  function createDefaultState() {
    return {
      version: SCHEMA_VERSION,
      profile: {
        theme: "system",                 // "system" | "light" | "dark"
        dailyGoalMinutes: DAILY_GOAL_DEFAULT,
        level: null,                      // レベル診断の結果（Phase 6）
        name: ""                          // 表示名（任意）
      },
      progress: {
        streak: { current: 0, longest: 0, lastStudyDate: null }, // 連続学習
        today: { date: null, studiedMinutes: 0 },                // 当日の学習量
        daily: {},   // { "YYYY-MM-DD": 学習分 } 進捗グラフ用の日次記録
        totals: { wordsLearned: 0, sessions: 0, shadowingRuns: 0 }
      },
      srs: {},        // 単語ごとの間隔反復状態（Phase 2）
      wordbook: [],   // リーディング等で保存した単語（Phase 6）
      videos: [],     // シャドーイング用に保存した動画（マイ動画ライブラリ）
      history: []     // シャドーイング等の練習履歴（Phase 3 以降）
    };
  }

  /* ---------- 内部ユーティリティ ---------- */

  // 当日の日付を "YYYY-MM-DD" で返す（ローカルタイム基準）
  function todayISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  // 2つの "YYYY-MM-DD" の差を日数で返す（a が新しいほど正）
  function daysBetween(olderISO, newerISO) {
    var older = new Date(olderISO + "T00:00:00");
    var newer = new Date(newerISO + "T00:00:00");
    return Math.round((newer - older) / MS_PER_DAY);
  }

  // 単純な再帰マージ：既定構造に保存値を重ね、欠損キーを補う（破損耐性の要）
  function deepMerge(base, override) {
    if (typeof override !== "object" || override === null || Array.isArray(override)) {
      return override === undefined ? base : override;
    }
    var result = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(override).forEach(function (key) {
      var baseVal = base ? base[key] : undefined;
      var overVal = override[key];
      if (
        typeof baseVal === "object" && baseVal !== null && !Array.isArray(baseVal) &&
        typeof overVal === "object" && overVal !== null && !Array.isArray(overVal)
      ) {
        result[key] = deepMerge(baseVal, overVal);
      } else {
        result[key] = overVal;
      }
    });
    return result;
  }

  // 旧バージョンのデータを最新スキーマへ移行する（将来の拡張点）
  function migrate(state) {
    // 例：if (state.version < 2) { ...; state.version = 2; }
    // Phase 1 時点では version 1 のみのため変換不要。
    state.version = SCHEMA_VERSION;
    return state;
  }

  /* ---------- 公開 API：読み書き ---------- */

  // 保存状態を読み込む。失敗時は既定状態を返す（例外を投げない）。
  function getState() {
    var def = createDefaultState();
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // プライベートブラウズ等で localStorage 自体が使えない場合
      console.warn("[storage] localStorage を読み取れません:", e);
      return def;
    }
    if (!raw) return def;

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn("[storage] 保存データが壊れています。初期化します:", e);
      return def;
    }
    if (typeof parsed !== "object" || parsed === null) return def;

    // 既定構造に重ねて欠損を補い、必要ならマイグレーション
    var merged = deepMerge(def, parsed);
    if (merged.version !== SCHEMA_VERSION) merged = migrate(merged);
    return merged;
  }

  // 状態を保存する。成功で true、失敗で false（容量超過など）。
  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error("[storage] 保存に失敗しました:", e);
      return false;
    }
  }

  // 関数型アップデート：現在状態を受け取り新状態を返す関数を渡す
  function update(updater) {
    var next = updater(getState());
    saveState(next);
    return next;
  }

  // 全データを初期化する
  function reset() {
    var def = createDefaultState();
    saveState(def);
    return def;
  }

  /* ---------- ストリーク／学習記録のヘルパー ---------- */

  // 「今日学習した」ことを記録し、連続日数を更新する。
  // 学習系モジュールが完了時に呼ぶ想定（minutes は加算する学習時間）。
  function recordStudy(minutes) {
    return update(function (state) {
      var today = todayISO();
      var streak = state.progress.streak;
      var last = streak.lastStudyDate;

      if (last !== today) {
        // 連続判定：前回が「昨日」なら継続、それ以外は途切れて 1 から
        if (last && daysBetween(last, today) === 1) {
          streak.current = streak.current + 1;
        } else {
          streak.current = 1;
        }
        streak.longest = Math.max(streak.longest, streak.current);
        streak.lastStudyDate = today;
      }

      // 当日の学習時間（日付が変わっていたらリセットして加算）
      if (state.progress.today.date !== today) {
        state.progress.today.date = today;
        state.progress.today.studiedMinutes = 0;
      }
      state.progress.today.studiedMinutes += (minutes || 0);

      // 日次記録（進捗グラフ用）にも加算
      if (!state.progress.daily) state.progress.daily = {};
      state.progress.daily[today] = (state.progress.daily[today] || 0) + (minutes || 0);

      return state;
    });
  }

  // 当日の学習時間（分）を返す。日付が変わっていれば 0。
  function getTodayMinutes() {
    var state = getState();
    if (state.progress.today.date !== todayISO()) return 0;
    return state.progress.today.studiedMinutes;
  }

  // 合計カウンタを加算する（例：{ wordsLearned: 1, sessions: 1 }）
  function incTotals(patch) {
    return update(function (state) {
      Object.keys(patch || {}).forEach(function (k) {
        state.progress.totals[k] = (state.progress.totals[k] || 0) + patch[k];
      });
      return state;
    });
  }

  // 直近 n 日の日次学習分を [{ date, minutes }]（古い→新しい順）で返す
  function getRecentDailyMinutes(n) {
    var state = getState();
    var daily = state.progress.daily || {};
    var out = [];
    var base = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(base.getTime() - i * MS_PER_DAY);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      var key = y + "-" + m + "-" + day;
      out.push({ date: key, minutes: daily[key] || 0 });
    }
    return out;
  }

  // 単語帳に語を追加（重複は無視）。{ en, ja, ipa } を想定。
  function addToWordbook(entry) {
    return update(function (state) {
      if (!Array.isArray(state.wordbook)) state.wordbook = [];
      var exists = state.wordbook.some(function (w) {
        return w.en && entry.en && w.en.toLowerCase() === entry.en.toLowerCase();
      });
      if (!exists) state.wordbook.push(entry);
      return state;
    });
  }

  // 練習履歴を追加（シャドーイング等）
  function addHistory(entry) {
    return update(function (state) {
      if (!Array.isArray(state.history)) state.history = [];
      state.history.unshift(entry); // 新しいものを先頭へ
      // 履歴は直近100件に制限（肥大化防止）
      if (state.history.length > 100) state.history = state.history.slice(0, 100);
      return state;
    });
  }

  // ---- マイ動画ライブラリ（シャドーイング用） ----
  function getVideos() {
    var v = getState().videos;
    return Array.isArray(v) ? v : [];
  }
  // 動画を保存。新規は { title, url, videoId, subtitles } を想定。
  // id があれば更新、無ければ採番して追加。保存後の動画オブジェクトを返す。
  function saveVideo(entry) {
    var saved = null;
    update(function (state) {
      if (!Array.isArray(state.videos)) state.videos = [];
      if (entry.id) {
        // 更新
        var idx = state.videos.findIndex(function (v) { return v.id === entry.id; });
        if (idx >= 0) { state.videos[idx] = Object.assign({}, state.videos[idx], entry); saved = state.videos[idx]; }
      } else {
        // 追加
        entry.id = "vid_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        entry.addedAt = new Date().toISOString();
        state.videos.unshift(entry);
        saved = entry;
      }
      return state;
    });
    return saved;
  }
  function deleteVideo(id) {
    return update(function (state) {
      if (!Array.isArray(state.videos)) state.videos = [];
      state.videos = state.videos.filter(function (v) { return v.id !== id; });
      return state;
    });
  }

  /* ---------- エクスポート / インポート ---------- */

  // 現在の全データを JSON ファイルとしてダウンロードさせる
  function exportToFile() {
    var state = getState();
    var json = JSON.stringify(state, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = "eigomaster-backup-" + todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // メモリ解放
    URL.revokeObjectURL(url);
  }

  // ファイル（File オブジェクト）から読み込み、検証して取り込む。
  // 成功で解決、失敗で reject（呼び出し側で日本語メッセージを表示する）。
  function importFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error("ファイルが選択されていません。"));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("ファイルの読み込みに失敗しました。"));
      };
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (e) {
          reject(new Error("JSON の形式が正しくありません。"));
          return;
        }
        // 最低限のスキーマ検証：オブジェクトで profile/progress を持つこと
        if (
          typeof parsed !== "object" || parsed === null ||
          typeof parsed.profile !== "object" || typeof parsed.progress !== "object"
        ) {
          reject(new Error("EigoMaster のバックアップ形式ではありません。"));
          return;
        }
        // 既定構造に重ねて欠損補完＋マイグレーション後に保存
        var merged = migrate(deepMerge(createDefaultState(), parsed));
        if (saveState(merged)) {
          resolve(merged);
        } else {
          reject(new Error("保存できませんでした。空き容量をご確認ください。"));
        }
      };
      reader.readAsText(file);
    });
  }

  /* ---------- グローバル公開 ---------- */
  window.Storage = {
    KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    todayISO: todayISO,
    getState: getState,
    saveState: saveState,
    update: update,
    reset: reset,
    recordStudy: recordStudy,
    getTodayMinutes: getTodayMinutes,
    incTotals: incTotals,
    getRecentDailyMinutes: getRecentDailyMinutes,
    addToWordbook: addToWordbook,
    addHistory: addHistory,
    getVideos: getVideos,
    saveVideo: saveVideo,
    deleteVideo: deleteVideo,
    exportToFile: exportToFile,
    importFromFile: importFromFile
  };
})();
