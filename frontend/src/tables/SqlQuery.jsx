import { useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { gradientLight , atomOneLight, vs, vs2015} from "react-syntax-highlighter/dist/esm/styles/hljs";
import { IonIcon } from "@ionic/react";  
import { clipboardOutline, checkmarkOutline } from "ionicons/icons";
import "./SqlQuery.css";

export const SqlQuery = ({ sql_query = "This is default Query" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql_query).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000); 
    });
  };

  return (
    <div className="sql-query-main">
      <div className="sql-query-header">
        <button onClick={handleCopy} className="copy-btn">
          <IonIcon icon={copied ? checkmarkOutline : clipboardOutline} className="icon" />
          {copied && <span>copied!</span>}
        </button>
      </div>
      <div className="sql-query-content">
        <SyntaxHighlighter
          className="scroll-container font-inter font-sm text-sm whitespace-pre-wrap"
          language="sql"
          style={vs}
          wrapLongLines={false}
          showLineNumbers={true}
        >
          {sql_query}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
