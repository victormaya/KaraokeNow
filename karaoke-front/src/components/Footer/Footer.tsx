import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <span>© {new Date().getFullYear()} VOKAO</span>
      <span className={styles.dot}>·</span>
      <span>
        Criado por{" "}
        <a
          href="https://victormayadev.com"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Victor Maya
        </a>
      </span>
      <span className={styles.dot}>·</span>
      <Link href="/privacidade" className={styles.link}>Política de Privacidade</Link>
      <span className={styles.dot}>·</span>
      <Link href="/termos" className={styles.link}>Termos de Uso</Link>
    </footer>
  );
}
