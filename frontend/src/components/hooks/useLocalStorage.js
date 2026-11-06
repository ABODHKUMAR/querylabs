import { useState, useEffect } from 'react';

// Custom hook for localStorage with value persistence
function useLocalStorage(key, initialValue) {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      try {
        return JSON.parse(item);
      } catch {
        return item; // fallback for plain strings
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  // Sync with localStorage changes from other components/tabs
  useEffect(() => {
    function handleStorageChange(event) {
      if (event.key === key) {
        try {
          const newValue = event.newValue;
          if (newValue === null) {
            setStoredValue(initialValue);
          } else {
            try {
              setStoredValue(JSON.parse(newValue));
            } catch {
              setStoredValue(newValue); // fallback for plain strings
            }
          }
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
        }
      }
    }

    // Listen for storage events
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue]);

  return [storedValue, setValue];
}

export default useLocalStorage;