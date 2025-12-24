import { AiItem, AiItemType, FileNode } from './types';

export const MOCK_FILE_TREE: FileNode[] = [
  {
    id: 'root',
    name: 'project_root',
    type: 'folder',
    children: [
      {
        id: 'backend',
        name: 'backend',
        type: 'folder',
        children: [
          { id: 'main.py', name: 'main.py', type: 'file', checked: true },
          { id: 'utils.py', name: 'utils.py', type: 'file', checked: true },
          { id: 'parser.py', name: 'parser.py', type: 'file', checked: true },
          { id: 'service.go', name: 'service.go', type: 'file', checked: true },
          { id: 'Auth.java', name: 'Auth.java', type: 'file', checked: true },
        ]
      },
      {
        id: 'frontend',
        name: 'frontend',
        type: 'folder',
        children: [
          { id: 'App.tsx', name: 'App.tsx', type: 'file', checked: true },
          { id: 'api.ts', name: 'api.ts', type: 'file', checked: true },
        ]
      },
      {
        id: 'ai_item',
        name: 'ai_item',
        type: 'folder',
        children: [
          { id: 'core.py', name: 'core.py', type: 'file', checked: true },
          { id: 'generator.py', name: 'generator.py', type: 'file', checked: true },
          { id: 'graph.py', name: 'graph.py', type: 'file', checked: true },
        ]
      },
      { id: 'README.md', name: 'README.md', type: 'file', checked: false },
    ]
  }
];

export const MOCK_AI_ITEMS: AiItem[] = [
  {
    id: 'parser.parse_file',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/parser.py',
    l0_code: 'def parse_file(path):\n    with open(path) as f:\n        tree = ast.parse(f.read())\n    return tree',
    l1_deps: [],
    l2_desc: 'Parses a single Python file into an AST object.'
  },
  {
    id: 'core.AiItem',
    type: AiItemType.CLASS,
    language: 'python',
    filePath: 'ai_item/core.py',
    l0_code: 'class AiItem:\n    def __init__(self, id, type):\n        self.id = id\n        self.type = type',
    l1_deps: [],
    l2_desc: 'Base class representing an atomic unit of knowledge in the codebase.'
  },
  {
    id: 'generator.generate_l2',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'ai_item/generator.py',
    l0_code: 'def generate_l2(item):\n    prompt = f"Describe {item.l0}"\n    return llm.invoke(prompt)',
    l1_deps: ['core.AiItem', 'utils.llm_client'],
    l2_desc: 'Generates the L2 semantic description for an AiItem using an external LLM.'
  },
  {
    id: 'graph.build_graph',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'ai_item/graph.py',
    l0_code: 'def build_graph(items):\n    G = nx.DiGraph()\n    for item in items:\n        G.add_node(item.id)\n    return G',
    l1_deps: ['core.AiItem'],
    l2_desc: 'Constructs a NetworkX directed graph from a list of AiItems.'
  },
  {
    id: 'main.run_pipeline',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/main.py',
    l0_code: 'def run_pipeline(path):\n    items = parser.parse_file(path)\n    enriched = generator.generate_l2(items)\n    graph.build_graph(enriched)',
    l1_deps: ['parser.parse_file', 'generator.generate_l2', 'graph.build_graph'],
    l2_desc: 'Orchestrates the entire RAG extraction pipeline from parsing to graph construction.'
  },
  {
    id: 'utils.llm_client',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/utils.py',
    l0_code: 'def llm_client(prompt):\n    return requests.post(API_URL, json={"prompt": prompt})',
    l1_deps: [],
    l2_desc: 'Helper function to communicate with the LLM API.'
  },
  // Polyglot Additions
  {
    id: 'App.render',
    type: AiItemType.FUNCTION,
    language: 'typescript',
    filePath: 'frontend/App.tsx',
    l0_code: 'const App: React.FC = () => {\n  useEffect(() => { api.fetchData(); }, []);\n  return <div>AiItem Dashboard</div>;\n};',
    l1_deps: ['api.fetchData'],
    l2_desc: 'Main React component entry point that triggers initial data fetching.'
  },
  {
    id: 'api.fetchData',
    type: AiItemType.FUNCTION,
    language: 'typescript',
    filePath: 'frontend/api.ts',
    l0_code: 'export const fetchData = async () => {\n  const res = await fetch("/api/graph");\n  return res.json();\n};',
    l1_deps: [],
    l2_desc: 'Asynchronous utility to fetch graph data from the backend.'
  },
  {
    id: 'service.ProcessingJob',
    type: AiItemType.STRUCT,
    language: 'go',
    filePath: 'backend/service.go',
    l0_code: 'type ProcessingJob struct {\n    ID string\n    Status string\n    Payload []byte\n}',
    l1_deps: [],
    l2_desc: 'Go struct defining the schema for a background processing job.'
  },
  {
    id: 'auth.Authenticator',
    type: AiItemType.INTERFACE,
    language: 'java',
    filePath: 'backend/Auth.java',
    l0_code: 'public interface Authenticator {\n    boolean login(String user, String pass);\n    void logout(String token);\n}',
    l1_deps: [],
    l2_desc: 'Java Interface defining the contract for authentication providers.'
  }
];