/**
 * Animation d'entrée de chaque page (motion design) : fondu, montée et
 * passage du flou au net, rejouée à chaque navigation. En CSS pur : une fois
 * terminée, aucune transformation ne reste (les éléments « fixed » des pages
 * ne sont pas perturbés).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="izi-page-enter">{children}</div>;
}
