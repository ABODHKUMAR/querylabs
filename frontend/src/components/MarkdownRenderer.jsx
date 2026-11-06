
import React from "react";
import "./MarkdownRenderer.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";

const MarkdownRenderer = ({ children, className = "" }) => {
  return (
    <div className={`prose prose-sm max-w-none  ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={tomorrow}
                  language={match[1]}
                  PreTag="div"
                  className="rounded-md  whitespace-pre-wrap"
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className="markdown-renderer-code" {...props}>
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h1 className="markdown-renderer-h1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="markdown-renderer-h2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="markdown-renderer-h3">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="markdown-renderer-h4">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="markdown-renderer-h5">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="markdown-renderer-h6">{children}</h6>
          ),
          p: ({ children }) => (
            <p className="markdown-renderer-p">{children}</p>
          ),
          hr: () => <hr className="markdown-renderer-hr" />,
          ul: ({ children }) => (
            <ul className="markdown-renderer-ul">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="markdown-renderer-ol">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="markdown-renderer-li">{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="markdown-renderer-a"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="markdown-renderer-blockquote">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="markdown-renderer-table-wrapper">
              <table className="markdown-renderer-table">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          strong: ({ children }) => <strong>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          del: ({ children }) => <del>{children}</del>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;