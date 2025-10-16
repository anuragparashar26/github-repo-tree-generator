import { useState, useEffect } from "react";
import "./App.css";

interface RepoNode {
  path: string;
  type: "file" | "dir";
  children?: RepoNode[];
}

interface AppState {
  inputType: "manual" | "url";
  owner: string;
  repo: string;
  repoUrl: string;
  token: string;
  markdownTree: string;
  loading: boolean;
  error: string | null;
  showCopied: boolean;
}

function App() {
  const [state, setState] = useState<AppState>({
    inputType: "url",
    owner: "",
    repo: "",
    repoUrl: "",
    token: "",
    markdownTree: "",
    loading: false,
    error: null,
    showCopied: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const owner = params.get('owner');
    const repo = params.get('repo');
    
    if (owner && repo) {
      setState(prev => ({
        ...prev,
        inputType: 'manual',
        owner: owner,
        repo: repo,
      }));
    }
  }, []);

  const parseRepoUrl = (
    url: string,
  ): { owner: string; repo: string } | null => {
    const regex =
      /https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/;
    const match = url.match(regex);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  };

  const fetchRepoStructure = async (
    owner: string,
    repo: string,
    path: string = "",
  ): Promise<RepoNode[]> => {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers: HeadersInit = { Accept: "application/vnd.github+json" };
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    try {
      const response = await fetch(url, { headers });
      const remaining = response.headers.get("X-RateLimit-Remaining");
      const resetTime = response.headers.get("X-RateLimit-Reset");
      if (remaining && parseInt(remaining) === 0) {
        const resetDate = resetTime
          ? new Date(parseInt(resetTime) * 1000).toLocaleString()
          : "soon";
        throw new Error(
          `GitHub API rate limit exceeded. Limit resets at ${resetDate}. Please enter a valid Personal Access Token (PAT) with 'repo' scope in the header to increase the limit to 5,000 requests/hour.`,
        );
      }
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            'GitHub API rate limit exceeded or access denied. Please enter a valid Personal Access Token (PAT) with "repo" scope in the header to increase the limit to 5,000 requests/hour.',
          );
        } else if (response.status === 404) {
          throw new Error(
            "Repository not found. Check the owner, repo name, or URL.",
          );
        } else if (response.status === 401) {
          throw new Error(
            'Invalid token. Ensure your Personal Access Token has "repo" scope.',
          );
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      const nodes: RepoNode[] = [];
      for (const item of data) {
        const node: RepoNode = { path: item.path, type: item.type };
        if (item.type === "dir") {
          try {
            node.children = await fetchRepoStructure(owner, repo, item.path);
          } catch (err: any) {
            console.warn(
              `Failed to fetch subdirectory ${item.path}: ${err.message}`,
            );
            node.children = [];
          }
        }
        nodes.push(node);
      }
      return nodes;
    } catch (error: any) {
      throw error;
    }
  };

  const generateMarkdownTree = (
    nodes: RepoNode[],
    indentLevel: number = 0,
    prefix: string = "",
  ): string => {
    let result = "";
    if (indentLevel === 0 && state.repo) {
      result += `${state.repo}/\n`;
    }
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const name = node.path.split("/").pop();
      const connector = isLast ? "└── " : "├── ";
      result += `${prefix}${connector}${name}${node.type === "dir" ? "/" : ""}\n`;
      if (node.children) {
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        result += generateMarkdownTree(
          node.children,
          indentLevel + 1,
          childPrefix,
        );
      }
    });
    return result;
  };

  const handleSubmit = async (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    let owner = state.owner;
    let repo = state.repo;
    if (state.inputType === "url") {
      if (!state.repoUrl) {
        setState({ ...state, error: "Please enter a repository URL" });
        return;
      }
      const parsed = parseRepoUrl(state.repoUrl);
      if (!parsed) {
        setState({
          ...state,
          error:
            "Invalid GitHub URL. Use format: https://github.com/owner/repo",
        });
        return;
      }
      owner = parsed.owner;
      repo = parsed.repo;
    } else if (!state.owner || !state.repo) {
      setState({
        ...state,
        error: "Please enter both owner and repository name",
      });
      return;
    }
    setState({ ...state, loading: true, error: null });
    try {
      const structure = await fetchRepoStructure(owner, repo);
      setState({
        ...state,
        repo,
        markdownTree: generateMarkdownTree(structure),
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setState({
        ...state,
        error: err.message,
        loading: false,
        markdownTree: "",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  const handleCopy = () => {
    navigator.clipboard
      .writeText(state.markdownTree)
      .then(() => {
        setState({ ...state, showCopied: true });
        setTimeout(() => setState({ ...state, showCopied: false }), 2000);
      })
      .catch(() => {
        setState({ ...state, error: "Failed to copy to clipboard" });
      });
  };

  return (
    <div className="page-container">
      <header className="header">
        <p className="header-info">
          API Rate Limit: 60 requests/hour (unauthenticated). To increase,
          generate a{" "}
          <a
            href="https://github.com/settings/tokens?type=beta"
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
          >
            GitHub Personal Access Token
          </a>{" "}
          with 'repo' scope and enter it below.
        </p>
        <input
          type="text"
          placeholder="Enter GitHub Personal Access Token"
          value={state.token}
          onChange={(e) => setState({ ...state, token: e.target.value })}
          className="header-token-input"
        />
      </header>
      <div className="app-container">
        <h1 className="app-title">GitHub Repo Tree Generator</h1>
        <div className="input-toggle">
          <label className="toggle-label">
            <input
              type="radio"
              name="inputType"
              value="url"
              checked={state.inputType === "url"}
              onChange={() =>
                setState({
                  ...state,
                  inputType: "url",
                  owner: "",
                  repo: "",
                  error: null,
                })
              }
              className="toggle-radio"
            />
            <span>URL Input</span>
          </label>
          <label className="toggle-label">
            <input
              type="radio"
              name="inputType"
              value="manual"
              checked={state.inputType === "manual"}
              onChange={() =>
                setState({
                  ...state,
                  inputType: "manual",
                  repoUrl: "",
                  error: null,
                })
              }
              className="toggle-radio"
            />
            <span>Manual Input</span>
          </label>
        </div>
        <div className="form">
          {state.inputType === "manual" ? (
            <>
              <input
                type="text"
                placeholder="Owner (e.g., anuragparashar26)"
                value={state.owner}
                onChange={(e) => setState({ ...state, owner: e.target.value })}
                onKeyDown={handleKeyDown}
                className="form-input"
              />
              <input
                type="text"
                placeholder="Repository (e.g., hello-world)"
                value={state.repo}
                onChange={(e) => setState({ ...state, repo: e.target.value })}
                onKeyDown={handleKeyDown}
                className="form-input"
              />
            </>
          ) : (
            <input
              type="text"
              placeholder="GitHub URL (e.g., https://github.com/anuragparashar26/hello-world)"
              value={state.repoUrl}
              onChange={(e) => setState({ ...state, repoUrl: e.target.value })}
              onKeyDown={handleKeyDown}
              className="form-input form-input"
            />
          )}
          <button
            onClick={handleSubmit}
            disabled={state.loading}
            className="form-button"
          >
            {state.loading ? "Loading..." : "Generate Tree"}
          </button>
        </div>
        {state.error && <p className="error">{state.error}</p>}
        {state.markdownTree && (
          <div className="tree-container">
            <button onClick={handleCopy} className="copy-button">
              {state.showCopied ? "Copied!" : "Copy"}
              {!state.showCopied && <span className="copy-icon">📋</span>}
            </button>
            <pre className="tree">
              <code>{state.markdownTree}</code>
            </pre>
          </div>
        )}
      </div>
      <footer className="footer">
        <a
          href="https://github.com/anuragparashar26/github-repo-tree-generator"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          <span className="github-icon">GitHub</span>
        </a>
      </footer>
    </div>
  );
}

export default App;
