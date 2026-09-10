import jwt from "jsonwebtoken";
import env from "../config/env.js";


export const signAccess = (payload) =>{
    if(!env.jwt.accessSecret){
        throw new Error("JWT Access Secret is not defined in environment variables");
    }
    
    return jwt.sign(payload,env.jwt.accessSecret,{
        expiresIn: env.jwt.accessExpires ||  "2h"
    });
}

export const signRefresh = (payload) =>{
    if(!env.jwt.refreshSecret){
        throw new Error("JWT Refresh Secret is not defined in environment variables");
    }
    return jwt.sign(payload,env.jwt.refreshSecret,{
        expiresIn: env.jwt.refreshExpires  || "30d"
    });
}


export const verifyAccess = (token) => {
  try {
    // Clean up token input (handle "Bearer ..." or accidental space)
    const cleanToken = token.startsWith("Bearer ")
      ? token.split(" ")[1].trim()
      : token.trim();

    return jwt.verify(cleanToken, env.jwt.accessSecret);
  } catch (err) {
    console.error(`JWT verifyAccess error: ${err.message} (Secret defined: ${!!env.jwt.accessSecret})`);
    return null;
  }
};



// Verify Refresh Token
export const verifyRefresh = (token) => {
  try {
    return jwt.verify(token, env.jwt.refreshSecret);
  } catch (err) {
    console.error("JWT verifyRefresh error:", err.message);
    return null;
  }
};
