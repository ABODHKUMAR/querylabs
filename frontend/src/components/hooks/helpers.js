export function validateEmail(email) {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i;
    return pattern.test(email);
  };

export function removeLocalStorage() {
  const keysToRemove = [
    "chatHistory",
    "allChatHistory",
    "selectedDatasetIds",
    "sessionId",
    "ql_userID",
    "ql_userName",
    "ql_userEmail",
    "userName",
    "userEmail",
    // legacy keys
    "n_userID",
    "n_userName",
    "n_userEmail",
  ];

  // Remove all keys
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/** Full client logout: clear storage + auth cookie. */
export function clearAuthSession() {
  removeLocalStorage();
  deleteCookie("authToken");
  try {
    // js-cookie may have set path=/ ; clear both ways
    document.cookie = "authToken=; Max-Age=0; path=/;";
  } catch (_) {}
}