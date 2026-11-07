"""Reescreve o conteúdo pré-questão para ensinar o assunto sem indicar a alternativa certa."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEW = {
    "2025-02-es": "Palavras viajam entre línguas e regiões. Ao estudar a história de uma palavra, observe de onde ela veio, por quem foi levada e que sentidos ganhou em cada lugar.",
    "2025-03-es": "Tempos verbais mudam o efeito do texto: o presente aproxima a cena; o pretérito perfeito conta fatos concluídos; o imperfeito indica hábitos e estados do passado; o futuro projeta o que virá.",
    "2025-04-es": "Variação linguística é o modo como a língua muda com a região, a idade e a situação. Em charges, repare no vocabulário, nas estruturas e no jeito como as falas foram escritas.",
    "2025-07": "Crônica é um gênero curto ligado ao cotidiano, nascido nos jornais. Compare: artigo de opinião defende uma tese, notícia informa e narrativa organiza fatos no tempo.",
    "2025-11": "Inocência é um romance regionalista romântico. Mostra a vida no sertão patriarcal do século XIX e o modo como a família decidia o futuro dos filhos.",
    "2025-12": "Práticas corporais têm vários papéis na sociedade: lazer, saúde, competição e direitos. Textos oficiais costumam apresentar o objetivo de um programa logo no início.",
    "2025-13": "A escolha entre linguagem formal e informal depende de vários fatores, como público, assunto, situação e gênero textual.",
    "2025-16": "O Simbolismo valoriza a sugestão, a musicalidade e o mistério, em vez de explicações diretas. Ao ler um poema simbolista, observe o que suas imagens sugerem.",
    "2025-20": "As línguas africanas influenciaram o português brasileiro. As religiões afro-brasileiras têm vocabulário próprio, ligado à sua história.",
    "2025-22": "A arte popular nasce do saber de comunidades e do contato com materiais do lugar. Observe como o artista olha para o material e o que muda nele.",
    "2025-23": "A arte contemporânea muitas vezes usa materiais e choque para tratar de história. Repare nos materiais da obra e no que cada um costuma simbolizar.",
    "2025-28": "Em poesia, sentimentos ganham força por repetições, apelos e imagens. Um refrão costuma mostrar a atitude do eu lírico diante do tema.",
    "2025-30": "Verbete é o texto que define uma palavra, como em dicionário. Ele pode trazer origem, usos e saberes ligados ao termo.",
    "2025-37": "Textos podem dialogar de várias formas: citação, paródia, alusão e paráfrase. Ao comparar dois textos, veja o que um retoma do outro.",
    "2025-39": "Meios de comunicação mudam com a tecnologia. Observe o que acontece com uma mídia antiga quando surge uma nova.",
    "2025-44": "Textos persuasivos usam vários recursos para convencer: condição, metáfora, exemplos, listas e apelos ao leitor.",
    "2025-45": "Em desenhos com legenda, texto e imagem trabalham juntos. O texto pode descrever, nomear, explicar ou contrapor a imagem.",
    "2025-47": "A atmosfera está em movimento. Temperatura, insolação, relevo, frentes frias e ventos são fatores do clima que o ENEM costuma cobrar.",
    "2025-48": "Empiristas, como Hume, valorizam a experiência. Na história da filosofia, vários autores discutiram os limites e os perigos da palavra bem usada.",
    "2025-49": "Na Idade Moderna, cidades europeias cresceram com navegação, trocas e circulação de pessoas. Cosmopolita é o lugar onde convivem pessoas de muitas origens.",
    "2025-50": "Direito é o conjunto das leis; justiça é um valor. Nem sempre coincidem: uma lei pode ser injusta, o que levanta a pergunta de como agir diante dela.",
    "2025-56": "Mudanças no clima afetam rios, chuvas e temperaturas. Isso atinge setores da economia de formas diferentes, inclusive em países ricos.",
    "2025-58": "No Império, o voto tinha muitas restrições, como renda, sexo e condição social. Reformas eleitorais podem mudar quem participa da política.",
    "2025-63": "O Brasil é líder em vários produtos agrícolas. Mudanças técnicas, políticas e econômicas ajudam a explicar esse desempenho.",
    "2025-65": "Doutrinas éticas respondem como devemos viver: eudaimonia busca a vida plena; hedonismo, o prazer; altruísmo, o bem dos outros; pragmatismo, o que funciona.",
    "2025-66": "A Escola de Frankfurt critica a sociedade de consumo e a indústria cultural. Marcuse discute como o conforto material pode reduzir o questionamento do sistema.",
    "2025-67": "A Constituição de 1988 prevê a função social da terra. A desapropriação é um instrumento para imóveis que descumprem essa regra.",
    "2025-68": "Fotos aéreas revelam como a cidade se organiza: altura das construções, usos do solo e ocupação da orla. Observe apenas o que a imagem realmente mostra.",
    "2025-70": "O intemperismo transforma as rochas e pode ser físico, químico ou biológico. Alguns tipos de rocha reagem de forma particular à água.",
    "2025-71": "Patrimônio histórico é o conjunto de bens que uma sociedade decide preservar. Construções antigas podem ter valor que vai além do material.",
    "2025-74": "Religiões afro-brasileiras sofrem racismo religioso. Um texto sociológico pode apontar causas internas e externas para esse processo.",
    "2025-75": "O uso de químicos na agricultura mudou a produção a partir do século XX. Esses produtos trazem ganhos, mas também têm efeitos sobre solo, água e seres vivos.",
    "2025-86": "A matriz elétrica brasileira tem várias fontes, como água, vento e sol. Novas tecnologias podem mudar a demanda por cada uma delas.",
    "2025-87": "A sociedade romana era dividida em grupos com direitos diferentes, como patrícios, plebeus e escravizados. Leis escritas mudaram o jogo político.",
    "2025-88": "Povos indígenas têm direito de manter e proteger seu patrimônio. Ele inclui línguas, técnicas, medicina, arte e formas de conhecimento.",
}
changed = 0
for path in sorted((ROOT / "data" / "explain").glob("*.json")):
    items = json.loads(path.read_text(encoding="utf-8"))
    for item in items:
        if item["id"] in NEW:
            item["conteudo"] = NEW[item["id"]]
            changed += 1
    path.write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
print("atualizados:", changed, "de", len(NEW))
