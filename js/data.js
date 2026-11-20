// Contestants and rules for Devil's Plan: Dead Again
export const CONTESTANTS = [
 {
  "id": "jang-dong-min",
  "name": "Jang Dong-min",
  "job": "Comedian & inventor",
  "facts": [
   "Has won every one of the five survival competitions he's entered. Netflix bills him as the \"God of Survival Shows.\"",
   "Holds patents in nine countries for a way to remove labels from bottles."
  ],
  "img": "img/jang-dong-min.jpg"
 },
 {
  "id": "oh-hyun-min",
  "name": "Oh Hyun-min",
  "job": "Math instructor",
  "facts": [
   "KAIST graduate nicknamed the \"human calculator.\"",
   "Runner-up on The Genius: Black Garnet, and winner of Code: Secret Room."
  ],
  "img": "img/oh-hyun-min.jpg"
 },
 {
  "id": "hong-jin-ho",
  "name": "Hong Jin-ho",
  "job": "Pro poker player",
  "facts": [
   "Played StarCraft professionally before switching to poker.",
   "Despite the nickname \"perennial runner-up,\" he's a past winner of The Genius."
  ],
  "img": "img/hong-jin-ho.jpg"
 },
 {
  "id": "jeong-hyun-gyu",
  "name": "Jeong Hyun-gyu",
  "job": "Student / influencer",
  "facts": [
   "Won Season 2 (Death Room). He was studying physical education at Seoul National University when he joined.",
   "First got noticed on the dating show EXchange 2 (Transit Love 2)."
  ],
  "img": "img/jeong-hyun-gyu.jpg"
 },
 {
  "id": "ha-seok-jin",
  "name": "Ha Seok-jin",
  "job": "Actor",
  "facts": [
   "Won Season 1 of The Devil's Plan.",
   "Has a mechanical engineering degree, and became known for solving puzzles on Problematic Men."
  ],
  "img": "img/ha-seok-jin.jpg"
 },
 {
  "id": "john-park",
  "name": "John Park",
  "job": "Singer",
  "facts": [
   "Came second on the singing competition Superstar K2 (2010).",
   "Won the top prize on the game show The Time Hotel."
  ],
  "img": "img/john-park.jpg"
 },
 {
  "id": "hyun-kyung-ryul",
  "name": "Hyun Kyung-ryul",
  "job": "Former Google engineer",
  "facts": [
   "Won the first season of Society Game."
  ],
  "img": "img/hyun-kyung-ryul.jpg"
 },
 {
  "id": "yurisa",
  "name": "Yurisa",
  "job": "Poker player, model & singer",
  "facts": [
   "Mensa member who won Season 2 of a survival show (The Risk Taker).",
   "Won an invitational poker tournament in Manila just two months after she started playing."
  ],
  "img": "img/yurisa.jpg"
 },
 {
  "id": "kim-dong-jae",
  "name": "Kim Dong-jae",
  "job": "Pro poker player",
  "facts": [
   "Was an amateur and a university student when he played Season 1 of The Devil's Plan.",
   "Has since won poker tournaments in Las Vegas and Taipei."
  ],
  "img": "img/kim-dong-jae.jpg"
 },
 {
  "id": "xitsuh",
  "name": "XITSUH (Seo Chul-gu)",
  "job": "Rapper",
  "facts": [
   "Known from Show Me the Money.",
   "Reached the semifinals in two seasons of Bloody Game."
  ],
  "img": "img/xitsuh.jpg"
 },
 {
  "id": "shindong",
  "name": "Shindong",
  "job": "Singer & entertainer (Super Junior)",
  "facts": [
   "His first survival competition, but he's played plenty of brain games on variety shows.",
   "Was a regular on The Great Escape, made by the same producer as The Devil's Plan."
  ],
  "img": "img/shindong.jpg"
 },
 {
  "id": "jaejae",
  "name": "Jaejae",
  "job": "TV host & producer",
  "facts": [
   "Known for her quick-witted celebrity interviews on the YouTube show MMTG.",
   "Has been on all three seasons of High School Mystery Club."
  ],
  "img": "img/jaejae.jpg"
 },
 {
  "id": "yi-do",
  "name": "Yi Do",
  "job": "Geography instructor",
  "facts": [
   "Graduated from Seoul National University.",
   "Was on Season 1 of Netflix's Better Late Than Single."
  ],
  "img": "img/yi-do.jpg"
 },
 {
  "id": "nucksal",
  "name": "Nucksal",
  "job": "Rapper",
  "facts": [
   "Came second on Show Me the Money 6.",
   "A big board-game fan. This is his first competitive game show."
  ],
  "img": "img/nucksal.jpg"
 },
 {
  "id": "stella-jang",
  "name": "Stella Jang",
  "job": "Singer-songwriter",
  "facts": [
   "Speaks four languages: Korean, English, French and Spanish.",
   "Has a master's degree in biotechnology from AgroParisTech."
  ],
  "img": "img/stella-jang.jpg"
 },
 {
  "id": "jung-won-young",
  "name": "Jung Won-young",
  "job": "IT project manager",
  "facts": [
   "Represented Korea at the 2017 Red Bull Escape Room World Championship.",
   "Has won several board-game tournaments."
  ],
  "img": "img/jung-won-young.jpg"
 }
];

export const RULES_HTML = "<h2>1. The basics</h2>\n<ul>\n<li><strong>Managers:</strong> 6</li>\n<li><strong>Roster:</strong> 2 drafted contestants plus 1 shared contestant from another manager (more on that later).</li>\n<li><strong>Goal:</strong> Most total points at the end of the finale wins the league!</li>\n</ul>\n<h2>2. Draft format</h2>\n<ul>\n<li><strong>Snake draft, 2 rounds.</strong> Randomly determine order and then every manager picks one contestant (don&#39;t look up spoilers!) Round 2 reverses order, so whoever picks 6th gets back-to-back picks.</li>\n<li><strong>Pick a 3rd shared contestant.</strong> After the draft, managers are randomly paired Secret Santa–style: each manager draws one other manager, and no manager is drawn twice. The drawing manager chooses one of the drawn manager&#39;s two contestants. The shared contestant:<ul>\n<li>doesn&#39;t take up a roster slot and can&#39;t be traded by the drawing manager,</li>\n<li>earns points for the drawing manager until they&#39;re eliminated,</li>\n<li>keeps earning for the drawing manager even if the original owner trades them away.</li>\n</ul>\n</li>\n</ul>\n<h2>3. Scoring</h2>\n<div class=\"tbl\"><table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Points</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Survives the episode (still in the game at the end)</td>\n<td>+1</td>\n</tr>\n<tr>\n<td>Wins the main match outright (individual winner)</td>\n<td>+5</td>\n</tr>\n<tr>\n<td>On the winning team/side of the main match (doesn&#39;t stack with an outright win)</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Top earner of the episode (most Garnets / pieces / prize currency)</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Wins a side match or mini-game</td>\n<td>+1</td>\n</tr>\n<tr>\n<td>Earns immunity or a protective advantage</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Survives a death match / elimination game</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Finds a secret (hidden stage, hidden rule, loophole, secret item)</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Pulls off a successful betrayal or big strategic move</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Sacrifices their own resources to save another player</td>\n<td>+1</td>\n</tr>\n<tr>\n<td>Saved from prison by the highest earner</td>\n<td>+1</td>\n</tr>\n<tr>\n<td>Earns a piece (per piece)</td>\n<td>+1</td>\n</tr>\n</tbody></table></div>\n<h3>End-of-season bonuses</h3>\n<p>These stack (e.g., the winner also gets the semi-finalist bonus).</p>\n<div class=\"tbl\"><table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Points</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Semi-finalist</td>\n<td>+2</td>\n</tr>\n<tr>\n<td>Runner Up</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Season Winner</td>\n<td>+5</td>\n</tr>\n</tbody></table></div>\n<h3>Penalties</h3>\n<div class=\"tbl\"><table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Points</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Finishes last / on the losing side of the main match</td>\n<td>−1</td>\n</tr>\n<tr>\n<td>Sent to the death match, prison, or elimination zone</td>\n<td>−1</td>\n</tr>\n<tr>\n<td>Publicly duped or betrayed (falls for someone else&#39;s scheme on screen)</td>\n<td>−1</td>\n</tr>\n<tr>\n<td>Penalized by the show for breaking a rule</td>\n<td>−3</td>\n</tr>\n<tr>\n<td>Quits / withdraws voluntarily</td>\n<td>−7</td>\n</tr>\n</tbody></table></div>\n<h3>Some Extra Fun</h3>\n<div class=\"tbl\"><table>\n<thead>\n<tr>\n<th></th>\n<th>Points</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Guess the Intro Time</td>\n<td>+1</td>\n</tr>\n<tr>\n<td>Contestant gets Moment of the Episode</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Elimination Prediction</td>\n<td>+3</td>\n</tr>\n<tr>\n<td>Season Winner Prediction</td>\n<td>+5</td>\n</tr>\n</tbody></table></div>\n<h2>4. Guess the Intro Time</h2>\n<ul>\n<li>This show&#39;s intro comes in sometimes at the start of the show, sometimes 45 minutes in. Before each episode, each manager should guess when they think it will happen (ex: at time stamp 20:15). Closest per episode wins a point. If there&#39;s a tie, all tied players win the point.</li>\n</ul>\n<h2>5. League vote: Moment of the Episode</h2>\n<ul>\n<li>After each episode, every manager votes for one <strong>Moment of the Episode</strong> (best play, biggest twist, funniest scene). Aaron will provide a list but all managers can propose another moment if they feel like one is missing.</li>\n<li>Most votes wins. Ties are broken randomly (coin flip / dice roll).</li>\n</ul>\n<h2>6. Elimination Prediction</h2>\n<ul>\n<li>Before each episode, each manager predicts the next contestant to go home. A correct guess is +3.</li>\n<li>If an episode has no elimination, your pick carries forward. You can change it before any episode.</li>\n<li>If several players go in one episode, you&#39;re right if your pick is one of them.</li>\n</ul>\n<h2>7. Trades and Free Agents</h2>\n<ul>\n<li>After episodes 4, 7, and 10, managers get a chance to trade contestants or pick up one of the remaining free agents.</li>\n<li>Starting with the lowest-scoring manager, each manager gets a chance to trade one or more contestants with other managers (if they agree).</li>\n<li>Managers can also optionally trade one of their contestants for a free agent. The free agent joins their roster and their traded contestant immediately goes into the free agent pool.</li>\n<li>If a manager has had one or more contestants eliminated, they can draft one available free agent.</li>\n<li>Once the pool of free agents is exhausted, that&#39;s it!</li>\n<li><strong>Roster cap:</strong> max 2 active contestants per manager and 1 shared contestant. An eliminated contestant frees up their slot. Shared contestants aren&#39;t replaced when eliminated.</li>\n<li><strong>No trading for your shared contestant.</strong> You can&#39;t make a trade that brings your own shared contestant to you.</li>\n<li><strong>Your shared contestant can&#39;t join your roster.</strong> You can&#39;t add a contestant you share but don&#39;t own to your roster by any route, including picking them up as a free agent.</li>\n<li><strong>Points stay where they were earned.</strong> In a trade, past points stay with the old manager. A free agent only scores for you from the episode after you pick them up.</li>\n</ul>\n<h2>8. When your contestant is eliminated</h2>\n<ul>\n<li>Points they&#39;ve made so far stay on your total. They just stop scoring.</li>\n<li>If both your contestants and your shared contestant are eliminated, you stop scoring until you can pick up a free agent at the next trade window (§7). If no free agents are left, your contestants are done scoring but you&#39;re still in the standings. Try to predict eliminations!</li>\n</ul>\n<h3>Comebacks</h3>\n<ul>\n<li>Just in case, given the name of the season - if an eliminated contestant re-enters the game, they return to whoever held them when they were eliminated, as long as that manager has an open roster slot. Otherwise they join the free-agent pool.</li>\n</ul>\n<h2>9. Stakes</h2>\n<ul>\n<li>KARAOKE?!?!?!</li>\n</ul>\n";
