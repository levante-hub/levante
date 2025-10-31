# LaTeX Math Support in Levante

Levante supports rendering mathematical formulas using LaTeX syntax through KaTeX.

## Quick Start

### Inline Math

Use single dollar signs `$...$` for inline math:

```markdown
The quadratic formula is $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ for equation $ax^2 + bx + c = 0$.
```

**Renders as:**
The quadratic formula is x = (-b ± √(b² - 4ac)) / 2a for equation ax² + bx + c = 0.

### Display Math (Block)

Use double dollar signs `$$...$$` for centered display math:

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

**Renders as a centered block equation.**

---

## Supported LaTeX Commands

### Basic Operations

| Syntax | Result | Description |
|--------|--------|-------------|
| `$x + y$` | x + y | Addition |
| `$x - y$` | x - y | Subtraction |
| `$x \times y$` | x × y | Multiplication |
| `$x \div y$` | x ÷ y | Division |
| `$\frac{a}{b}$` | a/b | Fraction |
| `$x^2$` | x² | Superscript |
| `$x_i$` | xᵢ | Subscript |

### Greek Letters

```latex
$\alpha, \beta, \gamma, \delta, \epsilon, \theta, \lambda, \mu, \pi, \sigma, \omega$
$\Gamma, \Delta, \Theta, \Lambda, \Sigma, \Omega$
```

### Common Functions

```latex
$\sin(x), \cos(x), \tan(x), \log(x), \ln(x), \exp(x)$
$\lim_{x \to \infty}, \sum_{i=1}^{n}, \prod_{i=1}^{n}, \int_{a}^{b}$
```

### Roots and Powers

```latex
$\sqrt{x}$ - square root
$\sqrt[n]{x}$ - nth root
$x^{n}$ - power
$x_{i,j}$ - multiple subscripts
```

### Calculus

```latex
$$
\frac{d}{dx}f(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}
$$

$$
\int_a^b f(x) dx = F(b) - F(a)
$$

$$
\nabla f = \left(\frac{\partial f}{\partial x}, \frac{\partial f}{\partial y}, \frac{\partial f}{\partial z}\right)
$$
```

### Linear Algebra

#### Matrices

```latex
$$
A = \begin{pmatrix}
a_{11} & a_{12} & a_{13} \\
a_{21} & a_{22} & a_{23} \\
a_{31} & a_{32} & a_{33}
\end{pmatrix}
$$
```

#### Determinants

```latex
$$
\det(A) = \begin{vmatrix}
a & b \\
c & d
\end{vmatrix} = ad - bc
$$
```

#### Systems of Equations

```latex
$$
\begin{cases}
x + y = 2 \\
2x - y = 1
\end{cases}
$$
```

### Set Theory

```latex
$\mathbb{R}$ - Real numbers
$\mathbb{N}$ - Natural numbers
$\mathbb{Z}$ - Integers
$\mathbb{Q}$ - Rational numbers
$\mathbb{C}$ - Complex numbers

$\in, \notin, \subset, \subseteq, \cup, \cap, \emptyset$
```

### Logic

```latex
$\land$ (and), $\lor$ (or), $\neg$ (not), $\implies$, $\iff$
$\forall, \exists, \nexists$
```

### Arrows and Relations

```latex
$\rightarrow, \leftarrow, \Rightarrow, \Leftarrow, \leftrightarrow, \Leftrightarrow$
$\leq, \geq, \neq, \approx, \equiv, \sim, \propto$
```

---

## Custom Macros

Levante includes some common macros for convenience:

```latex
$\RR$ → ℝ (Real numbers)
$\NN$ → ℕ (Natural numbers)
$\ZZ$ → ℤ (Integers)
$\QQ$ → ℚ (Rational numbers)
$\CC$ → ℂ (Complex numbers)
```

---

## Examples

### Physics

**Maxwell's Equations:**

```latex
$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\epsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\mathbf{J} + \mu_0\epsilon_0\frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$
```

**Schrödinger Equation:**

```latex
$$
i\hbar\frac{\partial}{\partial t}\Psi(\mathbf{r},t) = \hat{H}\Psi(\mathbf{r},t)
$$
```

### Statistics

**Normal Distribution:**

```latex
$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2}
$$
```

**Bayes' Theorem:**

```latex
$$
P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}
$$
```

### Machine Learning

**Softmax Function:**

```latex
$$
\text{softmax}(x_i) = \frac{e^{x_i}}{\sum_{j=1}^{n} e^{x_j}}
$$
```

**Cross-Entropy Loss:**

```latex
$$
L = -\sum_{i=1}^{n} y_i \log(\hat{y}_i)
$$
```

---

## Dark Mode Support

All LaTeX formulas automatically adapt to light and dark modes:

- **Light Mode**: Black text with dark gray lines
- **Dark Mode**: Light gray text (#E0E0E0) with medium gray lines (#A6A6A6)

No configuration needed - theme changes apply automatically!

---

## Tips and Best Practices

### 1. **Use Display Math for Complex Equations**

```markdown
❌ Inline: $\int_{-\infty}^{\infty} \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2} dx$

✅ Display:
$$
\int_{-\infty}^{\infty} \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2} dx
$$
```

### 2. **Use `\text{}` for Regular Text**

```latex
$$
f(x) = \begin{cases}
x^2 & \text{if } x \geq 0 \\
-x^2 & \text{if } x < 0
\end{cases}
$$
```

### 3. **Use `\left` and `\right` for Auto-Sizing**

```latex
❌ Bad: $(\frac{a}{b})$ - parentheses too small

✅ Good: $\left(\frac{a}{b}\right)$ - auto-sized parentheses
```

### 4. **Align Multi-Line Equations**

```latex
$$
\begin{aligned}
x &= a + b \\
  &= c + d \\
  &= e + f
\end{aligned}
$$
```

---

## Limitations

### Security

For security reasons, the following are **NOT allowed**:

- `\url{}` - URL commands (XSS risk)
- `\href{}` - Hyperlinks (XSS risk)
- `\includegraphics{}` - External images

### Unsupported Features

KaTeX does not support some advanced LaTeX features:

- TikZ diagrams (use Mermaid instead)
- Custom environments
- Some AMS packages

For a complete list of supported commands, see: [KaTeX Support Table](https://katex.org/docs/support_table.html)

---

## Troubleshooting

### Formula Not Rendering

1. **Check Syntax**: Ensure your LaTeX is valid
2. **Check Delimiters**: Use `$...$` for inline, `$$...$$` for display
3. **View Console**: Check browser DevTools for KaTeX errors

### Rendering Error Message

If you see a red error box, check:

- Mismatched braces: `{`, `}`, `[`, `]`, `(`, `)`
- Invalid command names
- Missing closing delimiters

### Example Error Fix

```latex
❌ Error: $\frac{a{b}$  - Mismatched braces

✅ Fixed: $\frac{a}{b}$
```

---

## Examples to Try

Ask the AI assistant:

```
Can you show me the Taylor series expansion?
```

```
Explain the Fourier transform with LaTeX formulas
```

```
Show me the definition of matrix multiplication using LaTeX
```

```
What's the formula for variance in statistics?
```

---

## Reference

- **KaTeX Documentation**: https://katex.org/docs/supported.html
- **LaTeX Math Symbols**: https://katex.org/docs/support_table.html
- **remark-math Plugin**: https://github.com/remarkjs/remark-math

---

**Version**: 1.0
**Last Updated**: 2025-10-29
**Component**: KaTeX Integration (response.tsx)
