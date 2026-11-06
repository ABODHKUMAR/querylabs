import Navbar from "./Navbar";

const noop = () => {};

/** Navbar wrapper; defaults allow Settings / Agent Studio pages without chat handlers. */
const Header = ({
  showHistory = false,
  setShowHistory = noop,
  handleNewChat = noop,
  setNewChat = noop,
  speakerEnable = false,
  setSpeakerEnable = noop,
}) => {
  return (
    <Navbar
      showHistory={showHistory}
      handleSidebarClick={() => setShowHistory(!showHistory)}
      handleNewChat={handleNewChat}
      setNewChat={setNewChat}
      speakerEnable={speakerEnable}
      setSpeakerEnable={setSpeakerEnable}
    />
  );
};

export default Header;