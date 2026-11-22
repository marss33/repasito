// Se carga aparte (lazy) porque Markdown + fórmulas pesan bastante y no hacen falta al abrir la app
import 'katex/dist/katex.min.css'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

export interface PropsMarkdown {
  texto: string
  componentes?: Components
  /** Para usar dentro de una línea (botones, tarjetas): sin párrafos ni márgenes */
  enLinea?: boolean
}

const enLineaComponentes: Components = { p: ({ children }) => <>{children}</> }

/** Ajusta lo que escribe la IA para que se vea bien:
 * - Fórmulas con \( ... \) y \[ ... \] (otra forma de escribir LaTeX) pasan a $ ... $ y $$ ... $$,
 *   porque el Markdown se come las barras y quedaría el código crudo.
 * - <br> (sobre todo dentro de tablas): como por seguridad no se muestra HTML, se cambia por un salto
 *   de línea de Markdown, o por " · " dentro de una tabla. */
function preparar(texto: string): string {
  return texto
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, formula: string) => `\n$$\n${formula.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, formula: string) => `$${formula.trim()}$`)
    .split('\n')
    .map((linea) => linea.replace(/<br\s*\/?>/gi, linea.trimStart().startsWith('|') ? ' · ' : '  \n'))
    .join('\n')
}

export default function MarkdownCompleto({ texto, componentes, enLinea }: PropsMarkdown) {
  const Contenedor = enLinea ? 'span' : 'div'
  return (
    <Contenedor className={enLinea ? 'md-linea' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={enLinea ? { ...enLineaComponentes, ...componentes } : componentes}
      >
        {preparar(texto)}
      </ReactMarkdown>
    </Contenedor>
  )
}
