const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_dev';

// 회원가입
router.post('/register', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: '닉네임과 비밀번호를 입력해주세요.' });
  }

  try {
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      'INSERT INTO users (nickname, password_hash) VALUES ($1, $2) RETURNING id, nickname',
      [nickname, hash]
    );

    res.status(201).json({ message: '가입 성공', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: '이미 존재하는 닉네임입니다.' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: '닉네임과 비밀번호를 입력해주세요.' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE nickname = $1', [nickname]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: '존재하지 않는 닉네임입니다.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
    }

    const token = jwt.sign(
      { id: user.id, nickname: user.nickname },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: '로그인 성공',
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        play_time_seconds: user.play_time_seconds,
        matches_played: user.matches_played,
        wins: user.wins,
        equipped_title: user.equipped_title
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
