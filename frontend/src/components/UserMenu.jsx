import React from 'react';

const UserMenu = ({ onLogout }) => {
  return (
    <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 shadow-lg rounded-md z-50">
      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        onClick={onLogout}
      >
        Log out
      </button>
    </div>
  );
};

export default UserMenu;