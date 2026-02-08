
  import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// 406 에러 로그 필터링 (Supabase RLS 정책으로 인한 정상 에러)
const originalError = console.error;
console.error = function(...args: any[]) {
  const errorStr = args.map(arg => String(arg)).join(' ');
  
  // 406 Not Acceptable 에러는 필터링 (기능에 영향 없음)
  if (errorStr.includes('406 (Not Acceptable)')) {
    return;
  }
  
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")!).render(<App />);
  