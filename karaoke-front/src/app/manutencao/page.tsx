import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "VOKAO — Em Manutenção",
  description: "O VOKAO está temporariamente fora do ar para manutenção. Voltamos em breve!",
  robots: "noindex, nofollow",
};

export default function ManutencaoPage() {
  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>🎤</div>
        <h1 className={styles.title}>Em Manutenção</h1>
        <p className={styles.subtitle}>
          O <strong>VOKAO</strong> está temporariamente fora do ar.
        </p>
        <p className={styles.body}>
          Estamos trabalhando para melhorar a plataforma.
          <br />
          Voltamos em breve!
        </p>
        <div className={styles.divider} />
        <p className={styles.contact}>
          Dúvidas?{" "}
          <a href="mailto:victor.maya42@gmail.com" className={styles.link}>
            Entre em contato
          </a>
        </p>
      </div>
    </main>
  );
}
